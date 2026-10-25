# Run in the official OmniVoice Colab after selecting a free GPU runtime.
# Cell 1
!pip install omnivoice

# Cell 2
from omnivoice import OmniVoice
import soundfile as sf
import torch
from IPython.display import Audio, display
assert torch.cuda.is_available(), "Select a GPU runtime before loading."
model = OmniVoice.from_pretrained(
    "k2-fsa/OmniVoice", device_map="cuda:0", dtype=torch.float16, load_asr=True,
)

# Cell 3: single generation to keep the narrator consistent across the pitch.
# Random non-repeating youthful OmniVoice profile: female, teenager, high pitch, american accent
audio = model.generate(
    text="Meet Mezora, a business treasury workspace for M U S D on Mezo. It connects bills, cash commitments and verified payments, so a small team can see what its money is already promised to cover.\n\nA wallet balance is only part of the picture. Upcoming bills compete for the same cash. Duplicate invoices and changed recipients need review. And every payment needs a connection to the bill it paid. Mezora brings those decisions together.\n\nStart with a bill. Review the amount, recipient and terms. Reserve M U S D for that commitment, approve the exact payment and reconcile its confirmed receipt. Reservations are owner cancelable cash commitments. They are not vendor escrow.\n\nThe business workspace adds a thirty day cash plan, an operating buffer and saved scenarios. Invoice checks support review before payment. Documents and C S V imports create drafts. Customer receivables and statements keep the supporting records together. Recurring schedules generate drafts for review.\n\nShared approval is demonstrated through a separate V two contract. Both owner and reviewer signed separate reserve and pay requests. The one M U S D test payment reached the configured recipient on Mezo Testnet. The main workspace remains on V one. No migration occurred.\n\nMezora also reads a Mezo borrower position and prepares partial repayment within protocol debt constraints. Our test withdrew one M U S D, then repaid half an M U S D through a separate wallet transaction. The unused half remained in the owner wallet. These are two transactions and two receipts.\n\nThe hosted app, source code and testnet evidence are available to inspect. Next come user testing, general V two integration and security review before a limited pilot. Contracts are unaudited. These self funded tests are not customer revenue. Explore Mezora at mezora dot vercel dot app.",
    instruct="female, teenager, high pitch, american accent",
)

sf.write("mezora-omnivoice.wav", audio[0], 24000)
display(Audio(audio[0], rate=24000))


# Inspect duration and listen before downloading. Do not claim the final 120s video yet.
import json
info = sf.info("mezora-omnivoice.wav")
print({"sample_rate": info.samplerate, "duration_seconds": info.duration})
from google.colab import files
files.download("mezora-omnivoice.wav")
