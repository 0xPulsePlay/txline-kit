# Mainnet deployment receipt

The valueless TxLINE demo escrow was deployed to Solana mainnet on July 18, 2026.

- Program: `AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS`
- ProgramData: `5GsqAeMyJTJ2dz98ZEcBgd2oYBSLkexnC9uFGWnHoF5C`
- Upgrade authority: `Cd5i4a2ydUY8xBVcGWLtdumvPPwfEeyMyXX8ZacLCyMP`
- Deployment transaction: `5bdtYk6BhKyCRWEB4rMneQavMnpaFew7HEfNcH4sdLLAhT3KEpiuLghuRR8wJaxwoWaJ3sE16DGeWtqfPZEXDuuH`
- Finalized slot: `433617453`
- Artifact length: `400128` bytes
- SHA-256: `1ea875ab3a0bf6b35c7b9a2e6b0c8329bf77b548ad804e0ca81674dd7607459b`
- ProgramData balance at deployment: `2.78609496 SOL`

The authority was deliberately retained; the deployment did not use the immutable or final option. This permits upgrades and permits the authority to close the program later to reclaim the ProgramData balance. Closing is permanent for this program address.

## Rehearsal and verification

Before mainnet deployment, the exact artifact and exact program address were deployed through the upgradeable loader on a fresh local validator containing clones of the live TxLINE program and its relevant root account. The UAT exercised proof-backed settlement, payout, missed-settlement refund, losing and duplicate claim rejection, premature refund rejection, protected position and market teardown, and closure of all seven escrow-owned test accounts.

The local program was then closed using the retained authority, reclaiming `2.78609496 SOL`. The rehearsal began with the production wallet's expected funded balance and proved that a `3 SOL` top-up was sufficient.

After mainnet finalization, the program was dumped back from the cluster. Its SHA-256 matched the local deployment artifact exactly.

To verify independently:

```sh
solana program show AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS --url mainnet-beta
solana confirm 5bdtYk6BhKyCRWEB4rMneQavMnpaFew7HEfNcH4sdLLAhT3KEpiuLghuRR8wJaxwoWaJ3sE16DGeWtqfPZEXDuuH --url mainnet-beta -v
solana program dump AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS deployed.so --url mainnet-beta
sha256sum deployed.so
```

This program is a hackathon demonstration and has not been audited. It must not custody valuable assets.
