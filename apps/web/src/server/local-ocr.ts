import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const requireModule=createRequire(join(process.cwd(),'package.json'));
// Keep runtime resolution dynamic: Turbopack rewrites literal require.resolve calls to module IDs.
const resolveRuntime=(name:string)=>requireModule.resolve(name);
let busy=false;
const MAX_BYTES=10*1024*1024;
const TIMEOUT_MS=25000;

// A separate Node process makes the deadline killable even while Tesseract's
// createWorker is initializing. Killing it also kills its worker threads.
// Only the public, static English traineddata is downloaded; input stays local.
const workerSource=String.raw`
const {pathToFileURL}=require('node:url');
console.log=console.error;
const fs=require('node:fs/promises');
const args=JSON.parse(process.argv[1]);
const sharp=require(args.sharp);
const {createWorker}=require(args.tesseract);
const chunks=[];
process.stdin.on('data',chunk=>chunks.push(chunk));
process.stdin.on('end',async()=>{
 let worker, pdfTask;
 try{
  const bytes=Buffer.concat(chunks), images=[];
  if(args.mime==='application/pdf'){
   const pdfjs=await import(pathToFileURL(args.pdfjs).href);
   const {createCanvas}=require(args.canvas);
   pdfTask=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:false,disableFontFace:true,isEvalSupported:false});
   const pdf=await pdfTask.promise;
   if(pdf.numPages>3)throw Error('Local OCR supports scanned PDFs up to 3 pages.');
   if(pdf.isPureXfa)throw Error('XFA forms are unsupported.');
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),base=page.getViewport({scale:1});
    const scale=Math.min(2,Math.sqrt(3900000/(base.width*base.height)));
    const viewport=page.getViewport({scale});
    if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<=0||viewport.height<=0)throw Error('Invalid PDF page dimensions.');
    const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
    if(width*height>4000000)throw Error('Local OCR pages support up to 4 megapixels.');
    const canvas=createCanvas(width,height);
    await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport}).promise;
    images.push(canvas.toBuffer('image/png'));page.cleanup();
   }
  }else{
   // Decoder limits apply before full decompression, including image bombs.
   const input=sharp(bytes,{limitInputPixels:4000000,animated:false});
   const info=await input.metadata();
   if(!['png','jpeg'].includes(info.format)||!info.width||!info.height)throw Error('Unsupported image.');
   if((info.pages||1)>1)throw Error('Local OCR supports single-frame images.');
   if(info.width*info.height>4000000)throw Error('Local OCR images support up to 4 megapixels.');
   images.push(await input.rotate().flatten({background:'white'}).png().toBuffer());
  }
  await fs.mkdir(args.cache,{recursive:true});
  worker=await createWorker('eng',1,{
   workerPath:args.workerPath,corePath:args.corePath,
   langPath:'https://tessdata.projectnaptha.com/4.0.0',
   cachePath:args.cache,cacheMethod:'write',
   errorHandler:()=>{},
  });
  const pages=[];
  for(let i=0;i<images.length;i++){
   const result=await worker.recognize(images[i],{}, {text:true});
   pages.push({page:i+1,text:result.data.text.slice(0,25000)});
  }
  process.stdout.write(JSON.stringify({pages}));
 }catch(error){process.stdout.write(JSON.stringify({error:error instanceof Error?error.message:'Local OCR failed.'}));process.exitCode=1;}
 finally{
  if(worker)await worker.terminate();
  if(pdfTask)await pdfTask.destroy();
 }
});
`;

export async function localOcr(bytes:Uint8Array,mime:string):Promise<{page:number;text:string}[]>{
 if(process.env.MEZORA_LOCAL_OCR!=='true')throw new Error('Local OCR is disabled.');
 if(!['image/png','image/jpeg','application/pdf'].includes(mime))throw new Error('Local OCR supports PDF, PNG and JPEG files.');
 if(!bytes.length||bytes.length>MAX_BYTES)throw new Error('Choose a document up to 10 MB.');
 if(busy)throw new Error('Local OCR is busy. Try again shortly.');
 busy=true;
 try{
  const args={mime,sharp:resolveRuntime('sharp'),tesseract:resolveRuntime('tesseract.js'),
   workerPath:resolveRuntime('tesseract.js/src/worker-script/node/index.js'),
   corePath:join(resolveRuntime('tesseract.js-core/package.json'),'..'),
   pdfjs:resolveRuntime('pdfjs-dist/legacy/build/pdf.mjs'),
   canvas:resolveRuntime('@napi-rs/canvas'),cache:join(tmpdir(),'mezora-ocr-eng-v1')};
  return await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--max-old-space-size=384','-e',workerSource,JSON.stringify(args)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   let output='',diagnostic='',failure:Error|undefined;child.stderr.on('data',(chunk:Buffer)=>{if(diagnostic.length<2000)diagnostic+=chunk.toString();});
   const timer=setTimeout(()=>{failure=new Error('Local OCR timed out after 25 seconds.');child.kill('SIGKILL');},TIMEOUT_MS);
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',(chunk:string)=>{
    output+=chunk;
    if(Buffer.byteLength(output)>300000){failure=new Error('Local OCR output exceeds limits.');child.kill('SIGKILL');}
   });
   child.on('error',error=>{failure=error;});
   child.stdin.on('error',()=>{});
   child.on('close',(code,signal)=>{
    clearTimeout(timer);
    if(failure){reject(failure);return;}if(!output){if(process.env.NODE_ENV==='development')console.error('[OCR worker]',diagnostic);reject(new Error(`Local OCR worker exited (${code??signal??'unknown'}). Retry extraction or enter fields manually.`));return;}
    try{
     const result=JSON.parse(output);
     if(result.error)throw new Error(String(result.error));
     if(!Array.isArray(result.pages)||!result.pages.length||result.pages.length>3||!result.pages.every((p:{page:unknown;text:unknown},i:number)=>p.page===i+1&&typeof p.text==='string'&&p.text.length<=25000))throw new Error('Local OCR returned an invalid result.');
     resolve(result.pages);
    }catch(error){reject(error instanceof Error?error:new Error('Local OCR failed.'));}
   });
   child.stdin.end(Buffer.from(bytes));
  });
 }finally{busy=false;}
}
