// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MezoraTreasury} from "../src/MezoraTreasury.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
}

contract MockToken is ERC20 {
    bool public fail;
    address public callback;
    bytes public callbackData;
    bool public reentrySucceeded;
    constructor() ERC20("Local MUSD", "MUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function execute(address to, bytes calldata data) external {
        (bool ok, bytes memory result) = to.call(data);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        return super.transferFrom(from, to, amount);
    }

    function setFail(bool value) external {
        fail = value;
    }

    function setCallback(address to, bytes calldata data) external {
        callback = to;
        callbackData = data;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        if (callback != address(0)) (reentrySucceeded,) = callback.call(callbackData);
        return super.transfer(to, amount);
    }
}

contract MezoraTreasuryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockToken token;
    MezoraTreasury treasury;
    address constant PAYEE = address(0xBEEF);
    bytes32 constant ID = bytes32(uint256(1));
    bytes32 constant TERMS = keccak256("terms with private nonce");

    function setUp() public {
        token = new MockToken();
        treasury = new MezoraTreasury(address(token), address(this));
        token.mint(address(this), 1000 ether);
        token.approve(address(treasury), type(uint256).max);
        treasury.deposit(1000 ether);
    }

    function eq(uint256 a, uint256 b) internal pure {
        require(a == b, "unequal");
    }

    function reserve() internal {
        treasury.reserve(ID, TERMS, PAYEE, 250 ether);
    }

    function onceDeposit(bytes32 requestId, uint256 amount, uint256 deadline) internal returns (bool ok) {
        (ok,) = address(treasury)
            .call(abi.encodeWithSignature("depositOnce(bytes32,uint256,uint256)", requestId, amount, deadline));
    }

    function onceWithdraw(bytes32 requestId, address to, uint256 amount, uint256 deadline) internal returns (bool ok) {
        (ok,) = address(treasury)
            .call(
                abi.encodeWithSignature(
                    "withdrawOnce(bytes32,address,uint256,uint256)", requestId, to, amount, deadline
                )
            );
    }

    function testOnceRequestsCannotReplayAcrossActions() public {
        token.mint(address(this), 20);
        require(onceDeposit(ID, 10, block.timestamp), "first deposit failed");
        require(!onceDeposit(ID, 10, block.timestamp), "deposit replay");
        require(!onceWithdraw(ID, PAYEE, 10, block.timestamp), "cross-action replay");
        bytes32 second = bytes32(uint256(2));
        require(onceWithdraw(second, PAYEE, 10, block.timestamp), "first withdrawal failed");
        require(!onceWithdraw(second, PAYEE, 20, block.timestamp), "changed-amount replay");
        require(!onceDeposit(second, 10, block.timestamp), "reverse cross-action replay");
        eq(token.balanceOf(PAYEE), 10);
    }

    function testOnceDeadlineAndIds() public {
        vm.warp(100);
        token.mint(address(this), 10);
        require(!onceDeposit(bytes32(0), 1, 101), "zero deposit ID");
        require(!onceWithdraw(bytes32(0), PAYEE, 1, 101), "zero withdraw ID");
        require(!onceDeposit(ID, 1, 99), "expired deposit");
        require(!onceWithdraw(ID, PAYEE, 1, 99), "expired withdrawal");
        require(onceDeposit(ID, 1, 100), "deadline equality rejected");
        require(onceWithdraw(bytes32(uint256(2)), PAYEE, 1, 101), "future deadline rejected");
    }

    function testOnceFailureRollsBackConsumedMarker() public {
        token.mint(address(this), 1);
        token.setFail(true);
        require(!onceDeposit(ID, 1, block.timestamp), "failed deposit succeeded");
        bytes32 second = bytes32(uint256(2));
        require(!onceWithdraw(second, PAYEE, 1, block.timestamp), "failed withdrawal succeeded");
        token.setFail(false);
        require(onceDeposit(ID, 1, block.timestamp), "deposit marker not rolled back");
        require(onceWithdraw(second, PAYEE, 1, block.timestamp), "withdraw marker not rolled back");
    }

    function testOncePauseAndAuthorization() public {
        token.mint(address(this), 1);
        vm.prank(PAYEE);
        require(!onceDeposit(ID, 1, block.timestamp), "unauthorized deposit");
        vm.prank(PAYEE);
        require(!onceWithdraw(ID, PAYEE, 1, block.timestamp), "unauthorized withdrawal");
        treasury.pause();
        require(!onceDeposit(ID, 1, block.timestamp), "paused deposit");
        require(onceWithdraw(ID, PAYEE, 1, block.timestamp), "paused free withdrawal failed");
    }

    function testDepositReservePayConservesFreeBalance() public {
        reserve();
        eq(treasury.totalReserved(), 250 ether);
        eq(treasury.availableBalance(), 750 ether);
        treasury.pay(ID);
        eq(token.balanceOf(PAYEE), 250 ether);
        eq(treasury.totalReserved(), 0);
        eq(treasury.availableBalance(), 750 ether);
        (bytes32 terms, address recipient, uint256 amount, MezoraTreasury.Status status) = treasury.commitments(ID);
        require(terms == TERMS && recipient == PAYEE, "terms changed");
        eq(amount, 250 ether);
        eq(uint256(status), 2);
    }

    function testEveryMutationRejectsUnauthorized() public {
        reserve();
        bytes[] memory calls = new bytes[](8);
        calls[0] = abi.encodeCall(treasury.deposit, (1));
        calls[1] = abi.encodeCall(treasury.reserve, (bytes32(uint256(2)), TERMS, PAYEE, 1));
        calls[2] = abi.encodeCall(treasury.pay, (ID));
        calls[3] = abi.encodeCall(treasury.cancel, (ID));
        calls[4] = abi.encodeCall(treasury.withdraw, (PAYEE, 1));
        calls[5] = abi.encodeCall(treasury.pause, ());
        calls[6] = abi.encodeCall(treasury.unpause, ());
        calls[7] = abi.encodeCall(treasury.reserve, (ID, TERMS, PAYEE, 1));
        for (uint256 i; i < calls.length; i++) {
            vm.prank(PAYEE);
            (bool ok,) = address(treasury).call(calls[i]);
            require(!ok, "unauthorized mutation");
        }
    }

    function testIdsCannotBeReusedOrPaidTwice() public {
        reserve();
        vm.expectRevert();
        reserve();
        treasury.pay(ID);
        vm.expectRevert();
        treasury.pay(ID);
        vm.expectRevert();
        reserve();
        vm.expectRevert();
        treasury.cancel(ID);
    }

    function testCanceledIdCannotBePaidOrReused() public {
        reserve();
        treasury.cancel(ID);
        eq(treasury.availableBalance(), 1000 ether);
        vm.expectRevert();
        treasury.pay(ID);
        vm.expectRevert();
        reserve();
        vm.expectRevert();
        treasury.cancel(ID);
    }

    function testInsufficientFreeBalanceRejectsReserveAndWithdraw() public {
        reserve();
        vm.expectRevert();
        treasury.reserve(bytes32(uint256(2)), TERMS, PAYEE, 751 ether);
        vm.expectRevert();
        treasury.withdraw(PAYEE, 751 ether);
        treasury.withdraw(PAYEE, 750 ether);
        eq(treasury.availableBalance(), 0);
        treasury.pay(ID);
        eq(token.balanceOf(address(treasury)), 0);
    }

    function testPauseBlocksNewRiskAndPermitsRecovery() public {
        reserve();
        treasury.pause();
        vm.expectRevert();
        treasury.deposit(1);
        vm.expectRevert();
        treasury.reserve(bytes32(uint256(2)), TERMS, PAYEE, 1);
        vm.expectRevert();
        treasury.pay(ID);
        treasury.withdraw(PAYEE, 750 ether);
        treasury.cancel(ID);
        treasury.withdraw(PAYEE, 250 ether);
        treasury.unpause();
        token.mint(address(this), 1);
        treasury.deposit(1);
        eq(treasury.availableBalance(), 1);
    }

    function testTokenTransferFailureRollsBackAccounting() public {
        reserve();
        token.setFail(true);
        vm.expectRevert();
        treasury.pay(ID);
        eq(treasury.totalReserved(), 250 ether);
        vm.expectRevert();
        treasury.withdraw(PAYEE, 1);
        eq(treasury.availableBalance(), 750 ether);
        token.setFail(false);
        treasury.pay(ID);
    }

    function testDepositRejectsFalseReturningToken() public {
        token.mint(address(this), 1);
        token.setFail(true);
        vm.expectRevert();
        treasury.deposit(1);
        eq(token.balanceOf(address(treasury)), 1000 ether);
    }

    function testUnexpectedTokenLossFailsClosedUntilReservationsCanceled() public {
        reserve();
        token.burn(address(treasury), 800 ether);
        vm.expectRevert(MezoraTreasury.Insolvent.selector);
        treasury.availableBalance();
        vm.expectRevert(MezoraTreasury.Insolvent.selector);
        treasury.pay(ID);
        treasury.cancel(ID);
        eq(treasury.availableBalance(), 200 ether);
    }

    function testOwnerTokenCallbackCannotReenterReserve() public {
        // Make the adversarial token the owner so authorization alone cannot mask reentry.
        MezoraTreasury guarded = new MezoraTreasury(address(token), address(token));
        token.mint(address(guarded), 100 ether);
        token.execute(address(guarded), abi.encodeCall(guarded.reserve, (ID, TERMS, PAYEE, 25 ether)));
        token.setCallback(address(guarded), abi.encodeCall(guarded.reserve, (bytes32(uint256(2)), TERMS, PAYEE, 1)));
        token.execute(address(guarded), abi.encodeCall(guarded.pay, (ID)));
        require(!token.reentrySucceeded(), "reentry succeeded");
        eq(guarded.totalReserved(), 0);
        eq(guarded.availableBalance(), 75 ether);
    }

    function testInvalidInputs() public {
        vm.expectRevert();
        new MezoraTreasury(address(0), address(this));
        vm.expectRevert();
        new MezoraTreasury(PAYEE, address(this));
        vm.expectRevert();
        new MezoraTreasury(address(token), address(0));
        vm.expectRevert();
        treasury.deposit(0);
        vm.expectRevert();
        treasury.reserve(bytes32(0), TERMS, PAYEE, 1);
        vm.expectRevert();
        treasury.reserve(ID, bytes32(0), PAYEE, 1);
        vm.expectRevert();
        treasury.reserve(ID, TERMS, address(0), 1);
        vm.expectRevert();
        treasury.reserve(ID, TERMS, address(treasury), 1);
        vm.expectRevert();
        treasury.reserve(ID, TERMS, PAYEE, 0);
        vm.expectRevert();
        treasury.withdraw(address(0), 1);
        vm.expectRevert();
        treasury.withdraw(address(treasury), 1);
        vm.expectRevert();
        treasury.withdraw(PAYEE, 0);
        vm.expectRevert();
        treasury.pay(ID);
        vm.expectRevert();
        treasury.cancel(ID);
    }

    function testDirectTokenDonationIsAvailable() public {
        token.mint(address(treasury), 42);
        eq(treasury.availableBalance(), 1000 ether + 42);
    }

    function testFuzzRandomSequencePreservesAccounting(uint256 seed) public {
        uint256 expectedReserved;
        uint256 paid;
        uint256 withdrawn;
        for (uint256 i = 1; i <= 64; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 amount = seed % (treasury.availableBalance() + 1);
            if (amount == 0) continue;
            bytes32 id = bytes32(i);
            treasury.reserve(id, TERMS, PAYEE, amount);
            expectedReserved += amount;
            if (seed % 3 == 0) {
                treasury.pay(id);
                paid += amount;
                expectedReserved -= amount;
            } else if (seed % 3 == 1) {
                treasury.cancel(id);
                expectedReserved -= amount;
            }
            uint256 free = treasury.availableBalance();
            if (seed % 5 == 0 && free > 0) {
                treasury.withdraw(PAYEE, free);
                withdrawn += free;
            }
            eq(treasury.totalReserved(), expectedReserved);
            require(expectedReserved <= token.balanceOf(address(treasury)), "insolvent");
            eq(treasury.availableBalance() + expectedReserved + paid + withdrawn, 1000 ether);
        }
    }
}

/// @dev Stateful handler only constructs valid authorized actions; fail_on_revert catches unexpected failure.
contract TreasuryHandler {
    MockToken public token;
    MezoraTreasury public treasury;
    uint256 public funded;
    uint256 public paid;
    uint256 public withdrawn;
    bytes32[] public ids;
    address constant PAYEE = address(0xBEEF);

    constructor() {
        token = new MockToken();
        treasury = new MezoraTreasury(address(token), address(this));
        token.approve(address(treasury), type(uint256).max);
    }

    function deposit(uint256 raw) external {
        uint256 amount = raw % 1e24 + 1;
        token.mint(address(this), amount);
        treasury.deposit(amount);
        funded += amount;
    }

    function reserve(uint256 raw) external {
        uint256 free = treasury.availableBalance();
        if (free == 0) return;
        bytes32 id = bytes32(ids.length + 1);
        treasury.reserve(id, keccak256("private salted terms"), PAYEE, raw % free + 1);
        ids.push(id);
    }

    function settle(uint256 raw, bool cancelIt) external {
        if (ids.length == 0) return;
        bytes32 id = ids[raw % ids.length];
        (,, uint256 amount, MezoraTreasury.Status status) = treasury.commitments(id);
        if (status != MezoraTreasury.Status.Reserved) return;
        if (cancelIt) {
            treasury.cancel(id);
        } else {
            treasury.pay(id);
            paid += amount;
        }
    }

    function withdraw(uint256 raw) external {
        uint256 free = treasury.availableBalance();
        if (free == 0) return;
        uint256 amount = raw % free + 1;
        treasury.withdraw(PAYEE, amount);
        withdrawn += amount;
    }

    function sumReserved() external view returns (uint256 total) {
        for (uint256 i; i < ids.length; i++) {
            (,, uint256 amount, MezoraTreasury.Status status) = treasury.commitments(ids[i]);
            if (status == MezoraTreasury.Status.Reserved) total += amount;
        }
    }
}

contract MezoraTreasuryInvariantTest {
    TreasuryHandler handler;

    function setUp() public {
        handler = new TreasuryHandler();
    }

    function targetContracts() external view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    // Foundry probes optional target/exclude discovery selectors. All unspecified lists are empty.
    fallback() external {
        assembly {
            mstore(0, 32)
            mstore(32, 0)
            return(0, 64)
        }
    }

    function invariantConservationAndReserveSum() public view {
        MezoraTreasury treasury = handler.treasury();
        uint256 balance = handler.token().balanceOf(address(treasury));
        require(treasury.totalReserved() <= balance, "reserved exceeds balance");
        require(treasury.totalReserved() == handler.sumReserved(), "reserve sum diverged");
        require(balance + handler.paid() + handler.withdrawn() == handler.funded(), "funds not conserved");
        require(treasury.availableBalance() + treasury.totalReserved() == balance, "free diverged");
    }
}
