// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice LOCAL/TEST ONLY. Owner plus immutable reviewer quorum for MUSD treasury actions.
/// @dev Unaudited. EOA signatures only; fixed non-rebasing, non-fee token only. No arbitrary calls or upgrade path.
contract MezoraTreasuryV2 is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    enum Action {
        Reserve,
        Pay,
        Cancel,
        Withdraw,
        Policy,
        Unpause
    }
    enum Status {
        None,
        Reserved,
        Paid,
        Canceled
    }

    struct Request {
        Action action;
        bytes32 id;
        bytes32 termsHash;
        address payee;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        uint256 policyVersion;
    }

    struct Commitment {
        bytes32 termsHash;
        address payee;
        uint256 amount;
        Status status;
    }
    IERC20 public immutable token;
    address public immutable owner;
    uint256 public immutable quorum;
    address[] public reviewers;
    mapping(address => bool) public isReviewer;
    mapping(uint256 => bool) public consumedNonces;
    mapping(bytes32 => Commitment) public commitments;
    uint256 public totalReserved;
    /// @notice Per-action maximum in token base units, not a daily or lifetime budget.
    uint256 public maxSpend;
    uint256 public minimumBuffer;
    uint256 public policyVersion = 1;
    bytes32 public constant REQUEST_TYPEHASH = keccak256(
        "Request(uint8 action,bytes32 id,bytes32 termsHash,address payee,uint256 amount,uint256 nonce,uint256 deadline,uint256 policyVersion)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    error InvalidConfiguration();
    error Unauthorized();
    error InvalidRequest();
    error InvalidSignature();
    error InvalidQuorum();
    error Replay();
    error Expired();
    error StalePolicy();
    error InsufficientAvailableBalance();
    error UnsupportedTokenBehavior();
    error Insolvent();
    event Deposited(address indexed sender, uint256 amount);
    event ActionExecuted(
        Action indexed action,
        uint256 indexed nonce,
        bytes32 indexed id,
        bytes32 termsHash,
        address payee,
        uint256 amount,
        uint256 policyVersion
    );
    event PolicyUpdated(uint256 indexed policyVersion, uint256 maxSpend, uint256 minimumBuffer);

    constructor(
        address token_,
        address owner_,
        address[] memory reviewers_,
        uint256 quorum_,
        uint256 maxSpend_,
        uint256 minimumBuffer_
    ) {
        if (
            token_ == address(0) || token_.code.length == 0 || owner_ == address(0) || owner_.code.length != 0
                || quorum_ == 0 || quorum_ > reviewers_.length || maxSpend_ == 0
        ) revert InvalidConfiguration();
        token = IERC20(token_);
        owner = owner_;
        quorum = quorum_;
        for (uint256 i; i < reviewers_.length; ++i) {
            address reviewer = reviewers_[i];
            if (reviewer == address(0) || reviewer == owner_ || reviewer.code.length != 0 || isReviewer[reviewer]) {
                revert InvalidConfiguration();
            }
            isReviewer[reviewer] = true;
            reviewers.push(reviewer);
        }
        maxSpend = maxSpend_;
        minimumBuffer = minimumBuffer_;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("MezoraTreasuryV2"), keccak256("2"), block.chainid, address(this))
        );
    }

    function requestDigest(Request calldata r) public view returns (bytes32) {
        bytes32 h = keccak256(
            abi.encode(
                REQUEST_TYPEHASH, r.action, r.id, r.termsHash, r.payee, r.amount, r.nonce, r.deadline, r.policyVersion
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), h));
    }

    function availableBalance() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        if (balance < totalReserved) revert Insolvent();
        return balance - totalReserved;
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (msg.sender != owner) revert Unauthorized();
        if (amount == 0) revert InvalidRequest();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenBehavior();
        availableBalance();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Anyone may relay complete approvals. Every signed action consumes a treasury-global nonce.
    function execute(Request calldata r, bytes calldata ownerSignature, bytes[] calldata reviewerSignatures)
        external
        nonReentrant
    {
        _authorize(r, ownerSignature, reviewerSignatures);
        if (r.action == Action.Policy) revert InvalidRequest();
        if (r.action == Action.Unpause) {
            _unpause();
        } else if (r.action == Action.Cancel) {
            Commitment storage c = _matchingCommitment(r);
            c.status = Status.Canceled;
            totalReserved -= r.amount;
        } else {
            _requireNotPaused();
            if (r.amount == 0 || r.amount > maxSpend || r.payee == address(0) || r.payee == address(this)) {
                revert InvalidRequest();
            }
            if (r.action == Action.Reserve) {
                if (r.id == bytes32(0) || r.termsHash == bytes32(0) || commitments[r.id].status != Status.None) {
                    revert InvalidRequest();
                }
                _checkFree(r.amount);
                commitments[r.id] = Commitment(r.termsHash, r.payee, r.amount, Status.Reserved);
                totalReserved += r.amount;
            } else if (r.action == Action.Pay) {
                Commitment storage c = _matchingCommitment(r);
                _checkFree(0);
                c.status = Status.Paid;
                totalReserved -= r.amount;
                _transfer(r.payee, r.amount);
            } else if (r.action == Action.Withdraw) {
                _checkFree(r.amount);
                _transfer(r.payee, r.amount);
            } else {
                revert InvalidRequest();
            }
        }
        emit ActionExecuted(r.action, r.nonce, r.id, r.termsHash, r.payee, r.amount, r.policyVersion);
    }

    /// @notice The current immutable quorum approves policy using the CURRENT version. Reviewer set cannot change.
    /// @dev termsHash must equal keccak256(abi.encode(newMaxSpend,newMinimumBuffer)).
    function updatePolicy(
        uint256 newMaxSpend,
        uint256 newMinimumBuffer,
        Request calldata r,
        bytes calldata ownerSignature,
        bytes[] calldata reviewerSignatures
    ) external nonReentrant {
        if (
            r.action != Action.Policy || newMaxSpend == 0
                || r.termsHash != keccak256(abi.encode(newMaxSpend, newMinimumBuffer))
        ) revert InvalidRequest();
        _authorize(r, ownerSignature, reviewerSignatures);
        // Raising the buffer cannot silently make current reservations undercollateralized against policy.
        if (availableBalance() < newMinimumBuffer) revert InsufficientAvailableBalance();
        maxSpend = newMaxSpend;
        minimumBuffer = newMinimumBuffer;
        ++policyVersion;
        emit ActionExecuted(r.action, r.nonce, r.id, r.termsHash, r.payee, r.amount, r.policyVersion);
        emit PolicyUpdated(policyVersion, newMaxSpend, newMinimumBuffer);
    }

    function pause() external nonReentrant {
        if (msg.sender != owner) revert Unauthorized();
        _pause();
        // An emergency pause revokes every previously collected approval, including unpause.
        ++policyVersion;
        emit PolicyUpdated(policyVersion, maxSpend, minimumBuffer);
    }

    function _authorize(Request calldata r, bytes calldata ownerSignature, bytes[] calldata reviewerSignatures)
        private
    {
        if (r.deadline < block.timestamp) revert Expired();
        if (r.policyVersion != policyVersion) revert StalePolicy();
        if (consumedNonces[r.nonce]) revert Replay();
        bytes32 digest = requestDigest(r);
        if (_recover(digest, ownerSignature) != owner) revert Unauthorized();
        if (reviewerSignatures.length < quorum || reviewerSignatures.length > reviewers.length) revert InvalidQuorum();
        address previous;
        for (uint256 i; i < reviewerSignatures.length; ++i) {
            address signer = _recover(digest, reviewerSignatures[i]);
            if (!isReviewer[signer] || signer <= previous) revert InvalidQuorum();
            previous = signer;
        }
        consumedNonces[r.nonce] = true;
    }

    function _matchingCommitment(Request calldata r) private view returns (Commitment storage c) {
        c = commitments[r.id];
        if (c.status != Status.Reserved || c.termsHash != r.termsHash || c.payee != r.payee || c.amount != r.amount) {
            revert InvalidRequest();
        }
    }

    function _checkFree(uint256 amount) private view {
        uint256 free = availableBalance();
        if (amount > free || free - amount < minimumBuffer) revert InsufficientAvailableBalance();
    }

    function _transfer(address payee, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        uint256 beforeRecipient = token.balanceOf(payee);
        token.safeTransfer(payee, amount);
        if (
            token.balanceOf(address(this)) != beforeBalance - amount
                || token.balanceOf(payee) != beforeRecipient + amount
        ) revert UnsupportedTokenBehavior();
        _checkFree(0);
    }

    /// @dev Strict 65-byte canonical ECDSA: v=27/28, low nonzero s, nonzero recovered signer.
    /// No ERC-1271, EIP-2098, personal_sign, or arbitrary signature validation callbacks.
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if ((v != 27 && v != 28) || uint256(s) == 0 || uint256(s) > HALF_ORDER) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
