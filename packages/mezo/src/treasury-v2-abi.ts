// Generated from local Solidity 0.8.28 / London build. LOCAL/TEST ONLY; no deployment or UI integration.
export const treasuryV2Abi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "token_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "reviewers_",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "quorum_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxSpend_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minimumBuffer_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "REQUEST_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "availableBalance",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "commitments",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "termsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum MezoraTreasuryV2.Status"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "consumedNonces",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "domainSeparator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "execute",
    "inputs": [
      {
        "name": "r",
        "type": "tuple",
        "internalType": "struct MezoraTreasuryV2.Request",
        "components": [
          {
            "name": "action",
            "type": "uint8",
            "internalType": "enum MezoraTreasuryV2.Action"
          },
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "termsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "payee",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "policyVersion",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "ownerSignature",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "reviewerSignatures",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isReviewer",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxSpend",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minimumBuffer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policyVersion",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quorum",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "requestDigest",
    "inputs": [
      {
        "name": "r",
        "type": "tuple",
        "internalType": "struct MezoraTreasuryV2.Request",
        "components": [
          {
            "name": "action",
            "type": "uint8",
            "internalType": "enum MezoraTreasuryV2.Action"
          },
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "termsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "payee",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "policyVersion",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reviewers",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "token",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalReserved",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "updatePolicy",
    "inputs": [
      {
        "name": "newMaxSpend",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "newMinimumBuffer",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "r",
        "type": "tuple",
        "internalType": "struct MezoraTreasuryV2.Request",
        "components": [
          {
            "name": "action",
            "type": "uint8",
            "internalType": "enum MezoraTreasuryV2.Action"
          },
          {
            "name": "id",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "termsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "payee",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "policyVersion",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "ownerSignature",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "reviewerSignatures",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ActionExecuted",
    "inputs": [
      {
        "name": "action",
        "type": "uint8",
        "indexed": true,
        "internalType": "enum MezoraTreasuryV2.Action"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "termsHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "policyVersion",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposited",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyUpdated",
    "inputs": [
      {
        "name": "policyVersion",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "maxSpend",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minimumBuffer",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Insolvent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientAvailableBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidConfiguration",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidQuorum",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRequest",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Replay",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "StalePolicy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnsupportedTokenBehavior",
    "inputs": []
  }
] as const;
