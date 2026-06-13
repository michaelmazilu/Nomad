/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/agent_passport.json`.
 */
export type AgentPassport = {
  "address": "43MLqvfxob3RoxGGLMdqGUERCiGN5NKWJyuvvBSVjjgi",
  "metadata": {
    "name": "agentPassport",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain agent identity & permission passport program"
  },
  "instructions": [
    {
      "name": "closePassport",
      "docs": [
        "Close the passport, refunding rent to the authority. This is revocation:",
        "after close, reading the PDA returns no account."
      ],
      "discriminator": [
        198,
        21,
        251,
        56,
        20,
        59,
        143,
        23
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Receives the refunded rent; must equal the passport's stored authority."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "passport"
          ]
        },
        {
          "name": "passport",
          "docs": [
            "Closing the account IS revocation: afterwards the PDA read returns nothing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  115,
                  115,
                  112,
                  111,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "passport.agent",
                "account": "passport"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "initializePassport",
      "docs": [
        "Create a passport PDA for `agent`, owned/edited by the signing `authority`.",
        "The agent key is identity-only and does NOT sign this instruction."
      ],
      "discriminator": [
        61,
        77,
        198,
        139,
        101,
        90,
        68,
        137
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Owner wallet: authority + rent payer. Signs the write."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "passport",
          "docs": [
            "Passport PDA, seeded by the agent identity pubkey."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  115,
                  115,
                  112,
                  111,
                  114,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "agent",
          "type": "pubkey"
        },
        {
          "name": "label",
          "type": "string"
        },
        {
          "name": "permissions",
          "type": {
            "vec": "string"
          }
        }
      ]
    },
    {
      "name": "updatePermissions",
      "docs": [
        "Replace the passport's permission set (full-set write, not deltas — so it",
        "is idempotent and free of lost-update hazards) and optionally the label.",
        "Only the stored `authority` may call this."
      ],
      "discriminator": [
        190,
        35,
        201,
        204,
        193,
        197,
        109,
        69
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must equal the passport's stored authority."
          ],
          "signer": true,
          "relations": [
            "passport"
          ]
        },
        {
          "name": "passport",
          "docs": [
            "Re-derived from the stored agent seed + stored canonical bump."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  115,
                  115,
                  112,
                  111,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "passport.agent",
                "account": "passport"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "label",
          "type": {
            "option": "string"
          }
        },
        {
          "name": "permissions",
          "type": {
            "vec": "string"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "passport",
      "discriminator": [
        18,
        61,
        245,
        239,
        6,
        15,
        18,
        34
      ]
    }
  ],
  "events": [
    {
      "name": "passportClosed",
      "discriminator": [
        250,
        79,
        10,
        165,
        212,
        71,
        11,
        186
      ]
    },
    {
      "name": "passportInitialized",
      "discriminator": [
        231,
        242,
        181,
        232,
        74,
        20,
        32,
        137
      ]
    },
    {
      "name": "passportUpdated",
      "discriminator": [
        55,
        139,
        137,
        64,
        153,
        163,
        91,
        26
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "labelTooLong",
      "msg": "Label exceeds maximum length"
    },
    {
      "code": 6001,
      "name": "tooManyPermissions",
      "msg": "Too many permission scopes"
    },
    {
      "code": 6002,
      "name": "scopeTooLong",
      "msg": "Permission scope exceeds maximum length"
    },
    {
      "code": 6003,
      "name": "emptyScope",
      "msg": "Permission scope must not be empty"
    },
    {
      "code": 6004,
      "name": "unauthorized",
      "msg": "Signer is not the passport authority"
    }
  ],
  "types": [
    {
      "name": "passport",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "Schema version (starts at 1; bump on layout change)."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "docs": [
              "Canonical PDA bump, stored so update/close re-validate against it."
            ],
            "type": "u8"
          },
          {
            "name": "authority",
            "docs": [
              "Owner wallet permitted to edit/close (and that paid the rent)."
            ],
            "type": "pubkey"
          },
          {
            "name": "agent",
            "docs": [
              "Agent identity pubkey — the PDA seed. Identity-only; never signs writes."
            ],
            "type": "pubkey"
          },
          {
            "name": "label",
            "docs": [
              "Human-readable label."
            ],
            "type": "string"
          },
          {
            "name": "permissions",
            "docs": [
              "Capability scopes. Count <= MAX_PERMISSIONS, each <= MAX_SCOPE_LEN bytes."
            ],
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "createdAt",
            "docs": [
              "Creation time, Unix SECONDS."
            ],
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "docs": [
              "Last update time, Unix SECONDS."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "passportClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "passportInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "label",
            "type": "string"
          },
          {
            "name": "permissions",
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "passportUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "passport",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "label",
            "type": "string"
          },
          {
            "name": "permissions",
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
