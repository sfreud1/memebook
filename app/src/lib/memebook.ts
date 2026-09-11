/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/memebook.json`.
 */
export type Memebook = {
  "address": "GGVLRegjz8K7op4KzJELS8GpEqHHCv7XagZBkEpCvsjh",
  "metadata": {
    "name": "memebook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Fixed-term, oracle-free, liquidation-free P2P lending for long-tail SPL tokens"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "pendingAdmin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "acceptOffer",
      "docs": [
        "Draw `draw_amount` of principal against an open offer, locking the",
        "pro-rata collateral for the offer's full duration."
      ],
      "discriminator": [
        227,
        82,
        234,
        131,
        1,
        18,
        48,
        2
      ],
      "accounts": [
        {
          "name": "borrower",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offer",
          "docs": [
            "`dup`: may legitimately be the same account as another in this",
            "instruction when one wallet holds more than one role. Anchor's guard",
            "exists to stop two deserialised copies fighting over a single write on",
            "exit; token accounts are owned by the token program and never written",
            "back by Anchor, so repeated CPI transfers touching one destination",
            "settle exactly as correctly as separate ones."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.lender",
                "account": "offer"
              },
              {
                "kind": "account",
                "path": "offer.offerId",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "borrower"
              },
              {
                "kind": "arg",
                "path": "loanId"
              }
            ]
          }
        },
        {
          "name": "principalMint",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offerVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              }
            ]
          }
        },
        {
          "name": "loanCollateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "loan"
              }
            ]
          }
        },
        {
          "name": "borrowerCollateralAccount",
          "writable": true
        },
        {
          "name": "borrowerPrincipalAccount",
          "writable": true
        },
        {
          "name": "feeRecipient"
        },
        {
          "name": "feePrincipalAccount",
          "docs": [
            "`dup`: this legitimately aliases another account in the same instruction",
            "when the lender is also the protocol's fee recipient — the operator",
            "seeding their own book is the obvious case. Anchor's duplicate-mutable",
            "guard exists to stop two deserialised copies fighting over one write on",
            "exit; token accounts are owned by the token program and never written",
            "back by Anchor, so two sequential CPI transfers to one destination are",
            "exactly as correct as two to different ones."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeRecipient"
              },
              {
                "kind": "account",
                "path": "principalTokenProgram"
              },
              {
                "kind": "account",
                "path": "principalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "principalTokenProgram"
        },
        {
          "name": "collateralTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "loanId",
          "type": "u64"
        },
        {
          "name": "drawAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelOffer",
      "docs": [
        "Withdraw whatever principal is still undrawn and close the offer. Loans",
        "already opened against it are untouched."
      ],
      "discriminator": [
        92,
        203,
        223,
        40,
        92,
        89,
        53,
        119
      ],
      "accounts": [
        {
          "name": "lender",
          "writable": true,
          "signer": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "lender"
              },
              {
                "kind": "account",
                "path": "offer.offerId",
                "account": "offer"
              }
            ]
          }
        },
        {
          "name": "principalMint",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offerVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              }
            ]
          }
        },
        {
          "name": "lenderPrincipalAccount",
          "writable": true
        },
        {
          "name": "principalTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "claimDefault",
      "docs": [
        "Claim the collateral of a loan that passed its maturity unpaid."
      ],
      "discriminator": [
        12,
        132,
        209,
        37,
        163,
        22,
        128,
        241
      ],
      "accounts": [
        {
          "name": "lender",
          "writable": true,
          "signer": true,
          "relations": [
            "loan"
          ]
        },
        {
          "name": "borrower",
          "docs": [
            "the loan and vault accounts — defaulting costs the collateral, not the rent."
          ],
          "writable": true
        },
        {
          "name": "feeRecipient",
          "writable": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "loan",
          "docs": [
            "`dup`: may legitimately be the same account as another in this",
            "instruction when one wallet holds more than one role. Anchor's guard",
            "exists to stop two deserialised copies fighting over a single write on",
            "exit; token accounts are owned by the token program and never written",
            "back by Anchor, so repeated CPI transfers touching one destination",
            "settle exactly as correctly as separate ones."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "borrower"
              },
              {
                "kind": "account",
                "path": "loan.loanId",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loanCollateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "loan"
              }
            ]
          }
        },
        {
          "name": "lenderCollateralAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "lender"
              },
              {
                "kind": "account",
                "path": "collateralTokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "feeCollateralAccount",
          "docs": [
            "`dup`: this legitimately aliases another account in the same instruction",
            "when the lender is also the protocol's fee recipient — the operator",
            "seeding their own book is the obvious case. Anchor's duplicate-mutable",
            "guard exists to stop two deserialised copies fighting over one write on",
            "exit; token accounts are owned by the token program and never written",
            "back by Anchor, so two sequential CPI transfers to one destination are",
            "exactly as correct as two to different ones."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeRecipient"
              },
              {
                "kind": "account",
                "path": "collateralTokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "collateralTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createOffer",
      "docs": [
        "Post an offer and escrow the principal behind it.",
        "",
        "`collateral_total` is the collateral demanded for a full draw of",
        "`principal_total`; together they are the LTV. Partial draws take a",
        "pro-rata slice, rounded up."
      ],
      "discriminator": [
        237,
        233,
        192,
        168,
        248,
        7,
        249,
        241
      ],
      "accounts": [
        {
          "name": "lender",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "lender"
              },
              {
                "kind": "arg",
                "path": "offerId"
              }
            ]
          }
        },
        {
          "name": "principalMint"
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "offerVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              }
            ]
          }
        },
        {
          "name": "lenderPrincipalAccount",
          "writable": true
        },
        {
          "name": "principalTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "offerId",
          "type": "u64"
        },
        {
          "name": "principalTotal",
          "type": "u64"
        },
        {
          "name": "collateralTotal",
          "type": "u64"
        },
        {
          "name": "minDraw",
          "type": "u64"
        },
        {
          "name": "aprBps",
          "type": "u32"
        },
        {
          "name": "durationSeconds",
          "type": "u32"
        },
        {
          "name": "expiryTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Must be the program's upgrade authority.",
            "",
            "Without this, `initialize_config` is a race: whoever lands the first",
            "call after deployment names the admin and the fee recipient, and on a",
            "public cluster that call can be front-run. Tying it to the upgrade",
            "authority means only the party that deployed the program can claim it."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "program",
          "address": "GGVLRegjz8K7op4KzJELS8GpEqHHCv7XagZBkEpCvsjh"
        },
        {
          "name": "programData"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
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
          "name": "admin",
          "type": "pubkey"
        },
        {
          "name": "feeRecipient",
          "type": "pubkey"
        },
        {
          "name": "originationFeeBps",
          "type": "u16"
        },
        {
          "name": "interestFeeBps",
          "type": "u16"
        },
        {
          "name": "defaultFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "proposeAdmin",
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "repay",
      "docs": [
        "Repay principal plus the fixed interest and take the collateral back.",
        "Only valid up to and including the maturity timestamp."
      ],
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "borrower",
          "writable": true,
          "signer": true,
          "relations": [
            "loan"
          ]
        },
        {
          "name": "lender",
          "writable": true
        },
        {
          "name": "feeRecipient",
          "writable": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "loan",
          "docs": [
            "`dup`: may legitimately be the same account as another in this",
            "instruction when one wallet holds more than one role. Anchor's guard",
            "exists to stop two deserialised copies fighting over a single write on",
            "exit; token accounts are owned by the token program and never written",
            "back by Anchor, so repeated CPI transfers touching one destination",
            "settle exactly as correctly as separate ones."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "borrower"
              },
              {
                "kind": "account",
                "path": "loan.loanId",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "principalMint",
          "relations": [
            "loan"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loanCollateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "loan"
              }
            ]
          }
        },
        {
          "name": "borrowerPrincipalAccount",
          "writable": true
        },
        {
          "name": "borrowerCollateralAccount",
          "writable": true
        },
        {
          "name": "lenderPrincipalAccount",
          "docs": [
            "`init_if_needed` on purpose. If the lender were able to close their token",
            "account before maturity, a missing destination would make repayment",
            "impossible and hand them the collateral for free. The borrower can always",
            "re-create it and pay off the loan.",
            "",
            "`dup`: equals `borrower_principal_account` when somebody borrows against",
            "their own offer, and `fee_principal_account` when the lender is also the",
            "fee recipient. Neither should make a loan unrepayable."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "lender"
              },
              {
                "kind": "account",
                "path": "principalTokenProgram"
              },
              {
                "kind": "account",
                "path": "principalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "feePrincipalAccount",
          "docs": [
            "`dup`: this legitimately aliases another account in the same instruction",
            "when the lender is also the protocol's fee recipient — the operator",
            "seeding their own book is the obvious case. Anchor's duplicate-mutable",
            "guard exists to stop two deserialised copies fighting over one write on",
            "exit; token accounts are owned by the token program and never written",
            "back by Anchor, so two sequential CPI transfers to one destination are",
            "exactly as correct as two to different ones."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "feeRecipient"
              },
              {
                "kind": "account",
                "path": "principalTokenProgram"
              },
              {
                "kind": "account",
                "path": "principalMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "principalTokenProgram"
        },
        {
          "name": "collateralTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setFeeRecipient",
      "discriminator": [
        227,
        18,
        215,
        42,
        237,
        246,
        151,
        66
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "feeRecipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setFees",
      "discriminator": [
        137,
        178,
        49,
        58,
        0,
        245,
        242,
        190
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "originationFeeBps",
          "type": "u16"
        },
        {
          "name": "interestFeeBps",
          "type": "u16"
        },
        {
          "name": "defaultFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "loan",
      "discriminator": [
        20,
        195,
        70,
        117,
        165,
        227,
        182,
        1
      ]
    },
    {
      "name": "offer",
      "discriminator": [
        215,
        88,
        60,
        71,
        170,
        162,
        73,
        229
      ]
    }
  ],
  "events": [
    {
      "name": "adminTransferred",
      "discriminator": [
        255,
        147,
        182,
        5,
        199,
        217,
        38,
        179
      ]
    },
    {
      "name": "feeRecipientUpdated",
      "discriminator": [
        24,
        150,
        233,
        92,
        169,
        221,
        233,
        244
      ]
    },
    {
      "name": "feesUpdated",
      "discriminator": [
        65,
        34,
        234,
        59,
        248,
        242,
        101,
        118
      ]
    },
    {
      "name": "loanDefaulted",
      "discriminator": [
        194,
        98,
        51,
        88,
        228,
        118,
        173,
        46
      ]
    },
    {
      "name": "loanOpened",
      "discriminator": [
        66,
        100,
        157,
        177,
        1,
        226,
        123,
        151
      ]
    },
    {
      "name": "loanRepaid",
      "discriminator": [
        202,
        183,
        88,
        60,
        211,
        54,
        142,
        243
      ]
    },
    {
      "name": "offerCancelled",
      "discriminator": [
        45,
        42,
        175,
        214,
        51,
        192,
        154,
        9
      ]
    },
    {
      "name": "offerCreated",
      "discriminator": [
        31,
        236,
        215,
        144,
        75,
        45,
        157,
        87
      ]
    },
    {
      "name": "pausedUpdated",
      "discriminator": [
        209,
        89,
        200,
        35,
        126,
        183,
        132,
        23
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6001,
      "name": "notAdmin",
      "msg": "Only the admin may perform this action"
    },
    {
      "code": 6002,
      "name": "notPendingAdmin",
      "msg": "Only the pending admin may accept the transfer"
    },
    {
      "code": 6003,
      "name": "feeTooHigh",
      "msg": "Fee exceeds the hard-coded maximum"
    },
    {
      "code": 6004,
      "name": "notUpgradeAuthority",
      "msg": "Only the program's upgrade authority may initialise it"
    },
    {
      "code": 6005,
      "name": "invalidDuration",
      "msg": "Loan duration outside the permitted range"
    },
    {
      "code": 6006,
      "name": "invalidApr",
      "msg": "APR outside the permitted range"
    },
    {
      "code": 6007,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6008,
      "name": "invalidExpiry",
      "msg": "Offer expiry must be in the future"
    },
    {
      "code": 6009,
      "name": "invalidMinDraw",
      "msg": "min_draw cannot exceed the total principal"
    },
    {
      "code": 6010,
      "name": "identicalMints",
      "msg": "Principal and collateral mints must differ"
    },
    {
      "code": 6011,
      "name": "offerExpired",
      "msg": "Offer has expired"
    },
    {
      "code": 6012,
      "name": "insufficientOfferLiquidity",
      "msg": "Offer does not have enough undrawn principal"
    },
    {
      "code": 6013,
      "name": "drawBelowMinimum",
      "msg": "Draw is smaller than the offer's minimum"
    },
    {
      "code": 6014,
      "name": "loanNotActive",
      "msg": "Loan is not active"
    },
    {
      "code": 6015,
      "name": "loanMatured",
      "msg": "Loan has already matured"
    },
    {
      "code": 6016,
      "name": "loanNotMatured",
      "msg": "Loan has not matured yet"
    },
    {
      "code": 6017,
      "name": "unsafeMint",
      "msg": "Mint carries a Token-2022 extension that makes escrow unsafe"
    },
    {
      "code": 6018,
      "name": "invalidMint",
      "msg": "Mint account could not be parsed"
    },
    {
      "code": 6019,
      "name": "transferAmountMismatch",
      "msg": "Token transfer moved a different amount than expected"
    },
    {
      "code": 6020,
      "name": "originationFeeExceedsPrincipal",
      "msg": "Origination fee would consume the entire disbursement"
    },
    {
      "code": 6021,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "adminTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "previousAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Two-step admin handover. Zero when no transfer is pending."
            ],
            "type": "pubkey"
          },
          {
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "originationFeeBps",
            "docs": [
              "Share of interest charged to the borrower up front, deducted from the",
              "principal actually disbursed."
            ],
            "type": "u16"
          },
          {
            "name": "interestFeeBps",
            "docs": [
              "Share of interest skimmed from the lender's return at repayment."
            ],
            "type": "u16"
          },
          {
            "name": "defaultFeeBps",
            "docs": [
              "Share of collateral skimmed when a lender claims a defaulted loan."
            ],
            "type": "u16"
          },
          {
            "name": "paused",
            "docs": [
              "Blocks new offers and new loans. Repay and claim stay open by design:",
              "pausing must never trap somebody's collateral."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "feeRecipientUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "feesUpdated",
      "docs": [
        "Fee changes only affect loans opened afterwards — rates are snapshotted onto",
        "each loan — but an observer still needs to see them happen."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "originationFeeBps",
            "type": "u16"
          },
          {
            "name": "interestFeeBps",
            "type": "u16"
          },
          {
            "name": "defaultFeeBps",
            "type": "u16"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "loan",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "principalMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "loanId",
            "type": "u64"
          },
          {
            "name": "principalAmount",
            "docs": [
              "Principal drawn, before the origination fee. This is what must be repaid."
            ],
            "type": "u64"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "Collateral actually received into escrow — measured by balance delta,",
              "never assumed from the instruction argument."
            ],
            "type": "u64"
          },
          {
            "name": "interestAmount",
            "docs": [
              "Interest owed at maturity. Fixed at accept time and never accrues:",
              "there is no rate curve, no utilisation, no oracle."
            ],
            "type": "u64"
          },
          {
            "name": "interestFeeBps",
            "docs": [
              "The protocol's cut, as agreed when this loan opened.",
              "",
              "Read from the loan rather than from config at settlement. Otherwise an",
              "admin could raise the rate after the fact and take a larger share of a",
              "return the lender had already committed to — terms that move under a",
              "position are exactly what this protocol promises not to do."
            ],
            "type": "u16"
          },
          {
            "name": "defaultFeeBps",
            "type": "u16"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "loanStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "loanDefaulted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loan",
            "type": "pubkey"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "collateralClaimed",
            "type": "u64"
          },
          {
            "name": "defaultFee",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "loanOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loan",
            "type": "pubkey"
          },
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "principalMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "principalAmount",
            "type": "u64"
          },
          {
            "name": "originationFee",
            "type": "u64"
          },
          {
            "name": "principalDisbursed",
            "type": "u64"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "interestAmount",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "loanRepaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "loan",
            "type": "pubkey"
          },
          {
            "name": "borrower",
            "type": "pubkey"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "principalAmount",
            "type": "u64"
          },
          {
            "name": "interestAmount",
            "type": "u64"
          },
          {
            "name": "interestFee",
            "type": "u64"
          },
          {
            "name": "lenderReceived",
            "type": "u64"
          },
          {
            "name": "collateralReturned",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "loanStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "repaid"
          },
          {
            "name": "defaulted"
          }
        ]
      }
    },
    {
      "name": "offer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "principalMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "principalTotal",
            "docs": [
              "Principal originally committed by the lender."
            ],
            "type": "u64"
          },
          {
            "name": "principalAvailable",
            "docs": [
              "Principal still undrawn and sitting in the offer vault."
            ],
            "type": "u64"
          },
          {
            "name": "collateralTotal",
            "docs": [
              "Collateral demanded for a full draw of `principal_total`.",
              "Together these two numbers are the LTV; partial draws are pro-rata."
            ],
            "type": "u64"
          },
          {
            "name": "minDraw",
            "docs": [
              "Smallest principal a borrower may draw, to stop dust loans from",
              "spamming the book with rent-bearing accounts."
            ],
            "type": "u64"
          },
          {
            "name": "aprBps",
            "type": "u32"
          },
          {
            "name": "durationSeconds",
            "type": "u32"
          },
          {
            "name": "expiryTs",
            "docs": [
              "After this the offer can no longer be accepted (loans already opened",
              "from it are unaffected)."
            ],
            "type": "i64"
          },
          {
            "name": "loansOpened",
            "docs": [
              "Monotonic counter, purely for indexing and analytics."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "offerCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "principalReturned",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "offerCreated",
      "docs": [
        "Every state transition emits an event. The indexer is built on these rather",
        "than on account polling, so the frontend never has to touch getProgramAccounts."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "lender",
            "type": "pubkey"
          },
          {
            "name": "principalMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "principalTotal",
            "type": "u64"
          },
          {
            "name": "collateralTotal",
            "type": "u64"
          },
          {
            "name": "minDraw",
            "type": "u64"
          },
          {
            "name": "aprBps",
            "type": "u32"
          },
          {
            "name": "durationSeconds",
            "type": "u32"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "pausedUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "loanSeed",
      "type": "bytes",
      "value": "[108, 111, 97, 110]"
    },
    {
      "name": "loanVaultSeed",
      "type": "bytes",
      "value": "[108, 111, 97, 110, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "offerSeed",
      "type": "bytes",
      "value": "[111, 102, 102, 101, 114]"
    },
    {
      "name": "offerVaultSeed",
      "type": "bytes",
      "value": "[111, 102, 102, 101, 114, 95, 118, 97, 117, 108, 116]"
    }
  ]
};
