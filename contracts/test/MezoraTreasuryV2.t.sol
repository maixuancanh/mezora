// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MezoraTreasuryV2} from "../src/MezoraTreasuryV2.sol";

interface VmV2 {
    function etch(address, bytes calldata) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function chainId(uint256) external;
    function warp(uint256) external;
    function expectRevert() external;
}

contract TokenV2 is ERC20 {
    bool public fail;
    constructor() ERC20("Local MUSD", "MUSD") {}

    function mint(address a, uint256 n) external {
        _mint(a, n);
    }

    function setFail(bool b) external {
        fail = b;
    }

    function transfer(address a, uint256 n) public override returns (bool) {
        if (fail) return false;
        return super.transfer(a, n);
    }
}

contract MezoraTreasuryV2Test {
    VmV2 constant vm = VmV2(address(uint160(uint256(keccak256("hevm cheat code")))));
    TokenV2 token;
    MezoraTreasuryV2 t;
    uint256 constant OWNER = 11;
    uint256 constant A = 22;
    uint256 constant B = 33;
    address constant PAYEE = address(0xbeef);

    function setUp() public {
        token = new TokenV2();
        address[] memory rs = new address[](2);
        rs[0] = vm.addr(A);
        rs[1] = vm.addr(B);
        t = new MezoraTreasuryV2(address(token), vm.addr(OWNER), rs, 2, 500, 100);
        token.mint(address(t), 1000);
    }

    function req(MezoraTreasuryV2.Action action, uint256 nonce)
        internal
        view
        returns (MezoraTreasuryV2.Request memory r)
    {
        r = MezoraTreasuryV2.Request(
            action,
            bytes32(uint256(1)),
            keccak256("bill terms"),
            PAYEE,
            250,
            nonce,
            block.timestamp + 100,
            t.policyVersion()
        );
    }

    function sig(uint256 key, bytes32 d) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function signatures(MezoraTreasuryV2.Request memory r) internal returns (bytes memory os, bytes[] memory rs) {
        bytes32 d = t.requestDigest(r);
        os = sig(OWNER, d);
        rs = new bytes[](2);
        if (vm.addr(A) < vm.addr(B)) {
            rs[0] = sig(A, d);
            rs[1] = sig(B, d);
        } else {
            rs[0] = sig(B, d);
            rs[1] = sig(A, d);
        }
    }

    function run(MezoraTreasuryV2.Request memory r) internal {
        (bytes memory os, bytes[] memory rs) = signatures(r);
        t.execute(r, os, rs);
    }

    function reject(MezoraTreasuryV2.Request memory r) internal {
        (bytes memory os, bytes[] memory rs) = signatures(r);
        vm.expectRevert();
        t.execute(r, os, rs);
    }

    function testReservePayConservesBufferAndHistory() public {
        run(req(MezoraTreasuryV2.Action.Reserve, 1));
        require(t.totalReserved() == 250);
        run(req(MezoraTreasuryV2.Action.Pay, 2));
        require(token.balanceOf(PAYEE) == 250);
        require(t.totalReserved() == 0);
        require(t.availableBalance() == 750);
        reject(req(MezoraTreasuryV2.Action.Pay, 3));
    }

    function testOwnerAloneAndOneReviewerCannotSpend() public {
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Withdraw, 1);
        (bytes memory os, bytes[] memory rs) = signatures(r);
        bytes[] memory one = new bytes[](1);
        one[0] = rs[0];
        vm.expectRevert();
        t.execute(r, os, one);
        bytes memory badOwner = sig(A, t.requestDigest(r));
        vm.expectRevert();
        t.execute(r, badOwner, rs);
    }

    function testDuplicateAndUnsortedReviewersRejected() public {
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Reserve, 1);
        (bytes memory os, bytes[] memory rs) = signatures(r);
        bytes memory saved = rs[1];
        rs[1] = rs[0];
        vm.expectRevert();
        t.execute(r, os, rs);
        rs[1] = rs[0];
        rs[0] = saved;
        vm.expectRevert();
        t.execute(r, os, rs);
    }

    function testReplayAcrossActionsAndTreasuriesRejected() public {
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Reserve, 1);
        (bytes memory os, bytes[] memory rs) = signatures(r);
        r.action = MezoraTreasuryV2.Action.Withdraw;
        vm.expectRevert();
        t.execute(r, os, rs);
        r.action = MezoraTreasuryV2.Action.Reserve;
        t.execute(r, os, rs);
        vm.expectRevert();
        t.execute(r, os, rs);
        r.action = MezoraTreasuryV2.Action.Withdraw;
        vm.expectRevert();
        t.execute(r, os, rs);
        address[] memory reviewers = new address[](2);
        reviewers[0] = vm.addr(A);
        reviewers[1] = vm.addr(B);
        MezoraTreasuryV2 other = new MezoraTreasuryV2(address(token), vm.addr(OWNER), reviewers, 2, 500, 100);
        token.mint(address(other), 1000);
        r.action = MezoraTreasuryV2.Action.Reserve;
        vm.expectRevert();
        other.execute(r, os, rs);
    }

    function testCrossChainAndChangedTermsRejected() public {
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Reserve, 1);
        (bytes memory os, bytes[] memory rs) = signatures(r);
        uint256 chain = block.chainid;
        vm.chainId(chain + 1);
        vm.expectRevert();
        t.execute(r, os, rs);
        vm.chainId(chain);
        r.termsHash = keccak256("tampered");
        vm.expectRevert();
        t.execute(r, os, rs);
        r = req(MezoraTreasuryV2.Action.Reserve, 1);
        r.amount++;
        vm.expectRevert();
        t.execute(r, os, rs);
        r = req(MezoraTreasuryV2.Action.Reserve, 1);
        r.payee = address(123);
        vm.expectRevert();
        t.execute(r, os, rs);
    }

    function testLowSAndInvalidVAndLengthRejected() public {
        MezoraTreasuryV2.Request memory q = req(MezoraTreasuryV2.Action.Reserve, 1);
        (bytes memory os, bytes[] memory rs) = signatures(q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER, t.requestDigest(q));
        bytes memory high = abi.encodePacked(
            r,
            bytes32(0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141 - uint256(s)),
            v == 27 ? uint8(28) : uint8(27)
        );
        vm.expectRevert();
        t.execute(q, high, rs);
        vm.expectRevert();
        t.execute(q, abi.encodePacked(r, s, uint8(0)), rs);
        vm.expectRevert();
        t.execute(q, hex"abcd", rs);
        os;
    }

    function testBufferReservedAndCapCannotBeBypassedByWithdraw() public {
        run(req(MezoraTreasuryV2.Action.Reserve, 1));
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Withdraw, 2);
        r.amount = 501;
        reject(r);
        r.amount = 500;
        run(r);
        r.nonce = 3;
        r.amount = 151;
        reject(r);
        require(t.availableBalance() == 250);
        require(t.totalReserved() == 250);
    }

    function testCancelRequiresQuorumAndNeverPays() public {
        run(req(MezoraTreasuryV2.Action.Reserve, 1));
        MezoraTreasuryV2.Request memory c = req(MezoraTreasuryV2.Action.Cancel, 2);
        (bytes memory os,) = signatures(c);
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert();
        t.execute(c, os, empty);
        run(c);
        require(t.totalReserved() == 0);
        require(token.balanceOf(PAYEE) == 0);
        reject(req(MezoraTreasuryV2.Action.Reserve, 3));
    }

    function testPolicyRequiresOldQuorumAndInvalidatesPendingApprovals() public {
        MezoraTreasuryV2.Request memory pending = req(MezoraTreasuryV2.Action.Withdraw, 8);
        (bytes memory oldos, bytes[] memory oldrs) = signatures(pending);
        MezoraTreasuryV2.Request memory p = req(MezoraTreasuryV2.Action.Policy, 1);
        p.termsHash = keccak256(abi.encode(uint256(900), uint256(200)));
        (bytes memory os, bytes[] memory rs) = signatures(p);
        bytes[] memory none = new bytes[](0);
        vm.expectRevert();
        t.updatePolicy(900, 200, p, os, none);
        t.updatePolicy(900, 200, p, os, rs);
        require(t.policyVersion() == 2 && t.maxSpend() == 900 && t.minimumBuffer() == 200);
        vm.expectRevert();
        t.execute(pending, oldos, oldrs);
    }

    function testOwnerPauseAndQuorumUnpause() public {
        vm.prank(vm.addr(OWNER));
        t.pause();
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Withdraw, 1);
        reject(r);
        r.action = MezoraTreasuryV2.Action.Unpause;
        run(r);
        r.action = MezoraTreasuryV2.Action.Withdraw;
        r.nonce = 2;
        run(r);
    }

    function testExpiredAndTokenFalseRollBackNonceAndReserve() public {
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Reserve, 1);
        r.deadline = 0;
        vm.warp(1);
        reject(r);
        run(req(MezoraTreasuryV2.Action.Reserve, 2));
        r = req(MezoraTreasuryV2.Action.Pay, 3);
        token.setFail(true);
        reject(r);
        require(!t.consumedNonces(3) && t.totalReserved() == 250);
        token.setFail(false);
        run(r);
    }

    function testCommitmentMismatchCannotRedirectPayment() public {
        run(req(MezoraTreasuryV2.Action.Reserve, 1));
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Pay, 2);
        r.amount = 249;
        reject(r);
        r.amount = 250;
        r.payee = address(42);
        reject(r);
        r.payee = PAYEE;
        r.termsHash = bytes32(uint256(42));
        reject(r);
        require(t.totalReserved() == 250 && token.balanceOf(PAYEE) == 0);
    }

    function testPolicyPayloadMutationAndOwnerOnlyUnpauseRejected() public {
        MezoraTreasuryV2.Request memory p = req(MezoraTreasuryV2.Action.Policy, 1);
        p.termsHash = keccak256(abi.encode(uint256(900), uint256(200)));
        (bytes memory os, bytes[] memory rs) = signatures(p);
        vm.expectRevert();
        t.updatePolicy(900, 0, p, os, rs);
        vm.prank(vm.addr(OWNER));
        t.pause();
        p = req(MezoraTreasuryV2.Action.Unpause, 2);
        (os, rs) = signatures(p);
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert();
        t.execute(p, os, empty);
        require(t.paused());
    }

    function testConstructorRejectsOwnerAsReviewerOrDuplicate() public {
        address[] memory rs = new address[](2);
        rs[0] = vm.addr(OWNER);
        rs[1] = vm.addr(A);
        address owner = vm.addr(OWNER);
        vm.expectRevert();
        new MezoraTreasuryV2(address(token), owner, rs, 2, 500, 100);
        rs[0] = rs[1];
        vm.expectRevert();
        new MezoraTreasuryV2(address(token), owner, rs, 2, 500, 100);
        rs[0] = vm.addr(B);
        vm.expectRevert();
        new MezoraTreasuryV2(address(token), owner, rs, 3, 500, 100);
    }

    function testFuzzReserveWithdrawPayPreservesBuffer(uint256 raw) public {
        uint256 n = raw % 400 + 1;
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Reserve, 1);
        r.amount = n;
        run(r);
        r.action = MezoraTreasuryV2.Action.Withdraw;
        r.nonce = 2;
        r.amount = 500;
        run(r);
        r.action = MezoraTreasuryV2.Action.Pay;
        r.nonce = 3;
        r.amount = n;
        run(r);
        require(t.totalReserved() == 0 && t.availableBalance() == 500 - n && t.availableBalance() >= 100);
        require(token.balanceOf(PAYEE) == 500 + n);
    }
    function testPauseRevokesPreviouslyCollectedUnpauseSignatures() public {
        MezoraTreasuryV2.Request memory r = req(MezoraTreasuryV2.Action.Unpause, 17);
        (bytes memory os, bytes[] memory rs) = signatures(r);
        vm.prank(vm.addr(OWNER));
        t.pause();
        vm.expectRevert();
        t.execute(r, os, rs);
        require(t.paused());
        r.policyVersion = t.policyVersion();
        run(r);
        require(!t.paused());
    }

    function testDigestMatchesIndependentViemTypedDataVector() public {
        // Vector generated independently with viem hashTypedData (not requestDigest).
        address target = address(0x1000000000000000000000000000000000000000);
        vm.etch(target, address(t).code);
        vm.chainId(31611);
        MezoraTreasuryV2.Request memory r = MezoraTreasuryV2.Request(
            MezoraTreasuryV2.Action.Reserve, bytes32(uint256(1)),
            0xb87638bf814b27cfa76bb192343a42f40e227e3230b5ce87c493942562a9fbf3,
            PAYEE, 250, 17, 2000000000, 1
        );
        require(MezoraTreasuryV2(target).requestDigest(r) ==
            0x26472d2da2fb79802b8715639df1b3ca85c2ed508c303e2f201cae555ff7fba5);
    }

}
