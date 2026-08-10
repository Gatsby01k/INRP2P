import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Reveal } from "@/components/motion";
import { LiquidityOrbit, NetworkConsole } from "@/components/site/liquidity-experience";
import { SiteFooter } from "@/components/site/footer";
import { SiteNav } from "@/components/site/nav";

const proof = [
  ["Pay-in", "Merchant collections"],
  ["Pay-out", "Payout instructions"],
  ["UTR", "Evidence recorded"],
  ["Direct", "External settlement"],
];

const corridors = [
  ["01", "Pay-in orders", "Choose an approved collection account, monitor the payment window and record customer-payment evidence."],
  ["02", "Pay-out orders", "See beneficiary details only after assignment, make the transfer directly and submit the UTR for review."],
  ["03", "Settlements", "Reconcile completed orders, partner fees and the final INR position against an external settlement reference."],
];

const evidence = [
  ["Partner identity", "Human review", "The operator behind the workspace is reviewed before processing is enabled."],
  ["Payment accounts", "Encrypted & reviewed", "Full UPI and bank destinations are encrypted; only approved rails can receive orders."],
  ["Operating reserve", "Confirmed", "Reserve evidence and the approved INR limit are recorded separately and visibly."],
  ["Order assignment", "Limit controlled", "Taking an order locks the required exposure and prevents a second partner taking it."],
  ["Payment evidence", "Time stamped", "UTRs, customer-payment marks, confirmations and disputes remain attached to the order."],
  ["Settlement", "Reconciled", "Completed orders and fees are netted into a recorded external settlement batch."],
];

function Arrow() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.75 9h10.5M10 4.75 14.25 9 10 13.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <span className="v3-check" aria-hidden="true">
      <svg viewBox="0 0 14 14" fill="none"><path d="m3 7 2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <div className="marketing-site v3-site">
      <SiteNav />
      <main>
        <section className="v3-hero">
          <div className="v3-hero-sticky">
            <div className="v3-hero-grid">
              <div className="v3-hero-copy">
                <p className="v3-kicker"><span /> Private INR processing network</p>
                <h1>INR processing,<br /><em>under control.</em></h1>
                <p className="v3-hero-lede">
                  Approved partners receive eligible merchant pay-in and pay-out orders, manage bank rails, record UTRs and reconcile settlements from one private desk.
                </p>
                <div className="v3-actions">
                  <Link href="/apply" className="v3-button v3-button-primary">Join as processing partner <Arrow /></Link>
                  <Link href="/request" className="v3-button v3-button-quiet">I represent a company</Link>
                </div>
                <div className="v3-trust-line">
                  <span><Check /> Manual partner approval</span>
                  <span><Check /> Encrypted bank details</span>
                  <span><Check /> No public order book</span>
                </div>
              </div>
              <LiquidityOrbit />
            </div>

            <div className="v3-proof-strip">
              {proof.map(([value, label], index) => (
                <div key={label}><span>0{index + 1}</span><strong>{value}</strong><small>{label}</small></div>
              ))}
            </div>
            <a className="v3-scroll-cue" href="#product" aria-label="Explore the product"><span>Launch</span><i /></a>
          </div>
        </section>

        <section id="product" className="v3-manifesto">
          <div className="v3-manifesto-field" aria-hidden="true" />
          <div className="v3-shell">
            <Reveal className="v3-manifesto-grid">
              <p className="v3-section-index">01 / Built for operators</p>
              <div>
                <p className="v3-kicker"><span /> A proper operating desk</p>
                <h2>The work is serious.<br /><em>The workflow should be simple.</em></h2>
              </div>
              <div className="v3-manifesto-copy">
                <p>Public chats mix unknown counterparties, bank details, UTRs and settlement calculations in one untracked thread.</p>
                <p>INRP2P gives approved operators a controlled path from merchant connection to order evidence and settlement reconciliation.</p>
                <Link href="/apply">Create your partner workspace <Arrow /></Link>
              </div>
            </Reveal>

            <div className="v3-principles">
              <Reveal index={0} className="v3-principle"><span>01</span><h3>Apply once. Operate privately.</h3><p>Create a workspace first, then complete review, reserve and payment-account activation in a guided sequence.</p></Reveal>
              <Reveal index={1} className="v3-principle"><span>02</span><h3>Take only eligible orders.</h3><p>The queue respects your approved limit, active bank rails, merchant connections and current availability.</p></Reveal>
              <Reveal index={2} className="v3-principle"><span>03</span><h3>Keep a record of every rupee.</h3><p>Assignments, UTRs, confirmations, disputes, fees and settlements remain connected to one order history.</p></Reveal>
            </div>
          </div>
        </section>

        <section id="operating-model" className="v3-model">
          <div className="v3-shell">
            <Reveal className="v3-model-head">
              <div><p className="v3-kicker v3-kicker-on-dark"><span /> One operating path</p><h2>From approval to settlement.<br /><em>No missing steps.</em></h2></div>
              <p>See the four stages that take a partner from application to controlled INR order processing.</p>
            </Reveal>
            <Reveal threshold={0.08}><NetworkConsole /></Reveal>
          </div>
        </section>

        <section className="v3-corridors">
          <div className="v3-corridors-bg" aria-hidden="true" />
          <div className="v3-shell v3-corridors-shell">
            <Reveal className="v3-corridors-head">
              <p className="v3-section-index">03 / Partner workspace</p>
              <div><p className="v3-kicker"><span /> The daily workflow</p><h2>Everything needed to operate,<br />nothing added for decoration.</h2></div>
              <p>Each screen answers one question: what can I take, what needs action, and what has been settled.</p>
            </Reveal>
            <div className="v3-corridor-list">
              {corridors.map(([number, title, body], index) => (
                <Reveal key={number} index={index} className="v3-corridor-row">
                  <span>{number}</span><h3>{title}</h3><p>{body}</p><BrandMark size={25} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="controls" className="v3-evidence">
          <div className="v3-shell">
            <Reveal className="v3-evidence-head">
              <div className="v3-zero">0</div>
              <div><p className="v3-kicker"><span /> Clear responsibility</p><h2>INRP2P records the workflow.<br /><em>You control the money.</em></h2></div>
              <p>Partners and companies use their own accounts and agreements. INRP2P coordinates access, records evidence and keeps the operational history.</p>
            </Reveal>

            <div className="v3-ledger">
              <div className="v3-ledger-head"><span>Control record</span><span>Decision</span><span>What it means</span></div>
              {evidence.map(([name, decision, meaning], index) => (
                <Reveal key={name} index={index} className="v3-ledger-row">
                  <span><i>0{index + 1}</i>{name}</span><strong><Check />{decision}</strong><p>{meaning}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="v3-access">
          <div className="v3-access-panel v3-access-company">
            <div className="v3-access-number">C</div>
            <div>
              <p className="v3-kicker"><span /> For companies</p>
              <h2>Build a network your team can defend.</h2>
              <p>Create controlled requirements, see current eligible capacity and release only the relationships you are ready to use.</p>
              <Link href="/request">Request company access <Arrow /></Link>
            </div>
          </div>
          <div className="v3-access-panel v3-access-partner">
            <div className="v3-access-number">P</div>
            <div>
              <p className="v3-kicker v3-kicker-on-dark"><span /> For processing partners</p>
              <h2>Turn approved capacity into an operating desk.</h2>
              <p>Complete review, connect payment rails, take eligible orders and track settlements without running the business from chat history.</p>
              <Link href="/apply">Create partner workspace <Arrow /></Link>
            </div>
          </div>
        </section>

        <section className="v3-final">
          <div className="v3-final-rings" aria-hidden="true"><i /><i /><i /></div>
          <div className="v3-final-mark"><BrandMark size={72} /></div>
          <p className="v3-kicker"><span /> Partner access</p>
          <h2>Ready to operate INR orders<br />from one controlled desk?</h2>
          <p>Create your workspace now. Live orders are enabled only after manual approval, reserve confirmation and payment-account review.</p>
          <div className="v3-actions">
            <Link href="/apply" className="v3-button v3-button-primary">Join as a partner <Arrow /></Link>
            <Link href="/how-it-works" className="v3-button v3-button-quiet">Read the operating standard</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
