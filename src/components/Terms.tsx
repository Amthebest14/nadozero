import { Panel } from './ui'

export function Terms() {
  return (
    <div className="space-y-4">
      <Panel title="What NadoZero actually holds">
        <div className="space-y-3 p-6 text-[13px] leading-relaxed text-slate-300">
          <p>
            NadoZero never holds your funds. Every deposit goes directly into a subaccount on Nado's own
            contracts, owned by your own wallet address — the same as if you'd used app.nado.xyz directly. If
            NadoZero disappeared entirely, your funds would still be exactly where they are now, under your own
            wallet's control.
          </p>
          <p>
            What NadoZero's backend <em>does</em> hold: an encrypted copy of a spare "signer" key, generated in
            your browser when you set up a copy. That key is what actually places the mirrored trades. It's
            encrypted at rest on our server — meaningfully better than the plaintext-download approach we started
            with, but honestly, not yet hardware-security-module-grade custody. Treat it accordingly: only fund
            what you're genuinely comfortable having exposed to a server-side compromise, however unlikely.
          </p>
        </div>
      </Panel>

      <Panel title="What a linked signer can and can't do">
        <div className="space-y-3 p-6 text-[13px] leading-relaxed text-slate-300">
          <p>
            A linked signer has full trading permission on your subaccount — it can open and close positions
            exactly like you could. Per Nado's own documentation, it can also <em>initiate</em> withdrawals — but
            those withdrawals always settle back to your main wallet address. It cannot send funds to any other
            address, including an attacker's, even if the key itself were somehow compromised.
          </p>
          <p>
            You can revoke a linked signer at any time from the Account page — it takes effect immediately, no
            confirmation delay.
          </p>
        </div>
      </Panel>

      <Panel title="Real risks — please actually read this">
        <div className="space-y-3 p-6 text-[13px] leading-relaxed text-slate-300">
          <p>
            <strong className="text-slate-100">Copying can lose money.</strong> A leader's past performance,
            however impressive, is not a promise of future results. You are taking on the same market risk they
            are, automatically, without a chance to reconsider each trade.
          </p>
          <p>
            <strong className="text-slate-100">Fees can matter more than you'd expect.</strong> We measured this
            directly in production: Nado charges a flat fee per order regardless of size. A leader who trades
            often, combined with a small fixed-dollar mirror size, can lose meaningfully more to fees than to
            price movement — sometimes most of a small account. NadoZero warns you about this before setup when
            a leader's recent trade frequency makes it likely, but the warning is an estimate, not a guarantee.
          </p>
          <p>
            <strong className="text-slate-100">Auto-pause is a safety net, not a guarantee.</strong> A copy
            automatically pauses if Nado rejects an order for insufficient account health — but this reacts to
            problems, it doesn't prevent losses that happen before that point is reached.
          </p>
          <p>
            <strong className="text-slate-100">This is not investment advice.</strong> Leaderboard rankings are
            built entirely from public, verifiable on-chain data — nothing here is a recommendation, and NadoZero
            has no opinion on which leader, if any, you should copy.
          </p>
          <p>
            <strong className="text-slate-100">Leaders can change without notice.</strong> Someone with a clean
            track record today can trade very differently tomorrow — larger size, more leverage, a different
            strategy entirely. You're copying their behavior, not a fixed plan.
          </p>
        </div>
      </Panel>

      <Panel title="Your responsibility">
        <div className="space-y-3 p-6 text-[13px] leading-relaxed text-slate-400">
          <p>Only deposit what you can afford to lose entirely. Check in on active copies periodically — don't treat "automatic" as "unattended forever." If something looks wrong, Pause or Stop first and ask questions after; both take effect immediately.</p>
        </div>
      </Panel>
    </div>
  )
}
