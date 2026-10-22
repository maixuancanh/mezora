// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Owner-controlled MUSD commitments. Reservations are cancelable by the owner, not vendor escrow.
/// @dev Deploy only for the verified, non-rebasing, non-fee MUSD token on the selected chain.
contract MezoraTreasury is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    enum Status {
        None,
        Reserved,
        Paid,
        Canceled
    }

    struct Commitment {
        bytes32 termsHash;
        address recipient;
        uint256 amount;
        Status status;
    }
    IERC20 public immutable token;
    address public immutable owner;
    mapping(bytes32 => Commitment) public commitments;
    mapping(bytes32 => bool) public consumedRequests;
    uint256 public totalReserved;

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidCommitment();
    error CommitmentAlreadyUsed();
    error CommitmentNotReserved();
    error InsufficientAvailableBalance();
    error Insolvent();
    error UnsupportedTokenBehavior();
    error InvalidRequestId();
    error RequestAlreadyConsumed();
    error RequestExpired();

    event Deposited(address indexed sender, uint256 amount);
    event Reserved(bytes32 indexed id, bytes32 indexed termsHash, address indexed recipient, uint256 amount);
    event Paid(bytes32 indexed id, bytes32 indexed termsHash, address indexed recipient, uint256 amount);
    event Canceled(bytes32 indexed id, bytes32 indexed termsHash, address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event RequestConsumed(bytes32 indexed requestId, bytes4 indexed action);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address token_, address owner_) {
        if (token_ == address(0) || token_.code.length == 0 || owner_ == address(0)) revert InvalidAddress();
        token = IERC20(token_);
        owner = owner_;
    }

    function availableBalance() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        if (balance < totalReserved) revert Insolvent();
        return balance - totalReserved;
    }

    function deposit(uint256 amount) external onlyOwner nonReentrant whenNotPaused {
        _deposit(amount);
    }

    /// @notice Application deposit path; a request ID can succeed only once across both once actions.
    function depositOnce(bytes32 requestId, uint256 amount, uint256 deadline)
        external
        onlyOwner
        nonReentrant
        whenNotPaused
    {
        _consumeRequest(requestId, deadline);
        _deposit(amount);
        emit RequestConsumed(requestId, this.depositOnce.selector);
    }

    function _deposit(uint256 amount) private {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenBehavior();
        availableBalance();
        emit Deposited(msg.sender, amount);
    }

    function reserve(bytes32 id, bytes32 termsHash, address recipient, uint256 amount)
        external
        onlyOwner
        nonReentrant
        whenNotPaused
    {
        if (id == bytes32(0) || termsHash == bytes32(0)) revert InvalidCommitment();
        _validateRecipient(recipient);
        if (amount == 0) revert InvalidAmount();
        if (commitments[id].status != Status.None) revert CommitmentAlreadyUsed();
        if (amount > availableBalance()) revert InsufficientAvailableBalance();
        commitments[id] = Commitment(termsHash, recipient, amount, Status.Reserved);
        totalReserved += amount;
        emit Reserved(id, termsHash, recipient, amount);
    }

    function pay(bytes32 id) external onlyOwner nonReentrant whenNotPaused {
        Commitment storage commitment = commitments[id];
        if (commitment.status != Status.Reserved) revert CommitmentNotReserved();
        // Detect unexpected token balance changes before releasing accounting.
        availableBalance();
        commitment.status = Status.Paid;
        totalReserved -= commitment.amount;
        token.safeTransfer(commitment.recipient, commitment.amount);
        availableBalance();
        emit Paid(id, commitment.termsHash, commitment.recipient, commitment.amount);
    }

    function cancel(bytes32 id) external onlyOwner nonReentrant {
        Commitment storage commitment = commitments[id];
        if (commitment.status != Status.Reserved) revert CommitmentNotReserved();
        commitment.status = Status.Canceled;
        totalReserved -= commitment.amount;
        emit Canceled(id, commitment.termsHash, commitment.recipient, commitment.amount);
    }

    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        _withdraw(to, amount);
    }

    /// @notice Application withdrawal path; remains available while paused for free-fund recovery.
    function withdrawOnce(bytes32 requestId, address to, uint256 amount, uint256 deadline)
        external
        onlyOwner
        nonReentrant
    {
        _consumeRequest(requestId, deadline);
        _withdraw(to, amount);
        emit RequestConsumed(requestId, this.withdrawOnce.selector);
    }

    function _withdraw(address to, uint256 amount) private {
        _validateRecipient(to);
        if (amount == 0) revert InvalidAmount();
        if (amount > availableBalance()) revert InsufficientAvailableBalance();
        token.safeTransfer(to, amount);
        availableBalance();
        emit Withdrawn(to, amount);
    }

    function pause() external onlyOwner nonReentrant {
        _pause();
    }

    function unpause() external onlyOwner nonReentrant {
        _unpause();
    }

    function _validateRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidAddress();
    }

    function _consumeRequest(bytes32 requestId, uint256 deadline) private {
        if (requestId == bytes32(0)) revert InvalidRequestId();
        if (consumedRequests[requestId]) revert RequestAlreadyConsumed();
        if (deadline < block.timestamp) revert RequestExpired();
        consumedRequests[requestId] = true;
    }
}
