/** Explains the application's logical flow and representative hosted architecture. */
export default function HowItWorks() {
  return (
    <>
      <p className="architecture-intro">
        From an advertiser brief to a jingle demo, Earwyrm combines its own music
        generation with optional AI services and human review.
      </p>

      <section className="architecture-section" aria-labelledby="logical-heading">
        <h3 id="logical-heading">From brief to demo</h3>
        <p>The workspace sends a brief to the API, which coordinates generation and saves the results for review.</p>
        <figure className="architecture-figure" aria-labelledby="logical-diagram-caption">
          <figcaption id="logical-diagram-caption">Logical architecture: the components behind a jingle demo</figcaption>
          <ol className="architecture-flow">
            <li><strong>Web workspace</strong><span>Collects the advertiser brief and the user's choices.</span></li>
            <li><strong>Application API</strong><span>Checks access and coordinates requests and saved work.</span></li>
            <li><strong>Generation</strong><span>The app creates music; configured AI services can add lyrics and voice.</span></li>
            <li><strong>Records and audio</strong><span>Stores results for protected playback and human review in the workspace.</span></li>
          </ol>
        </figure>
        <p>Instrumental previews do not require paid lyric or voice services. Voice rendering requires an estimate and confirmation. A generated demo is not broadcast approval.</p>
      </section>

      <section className="architecture-section" aria-labelledby="cloud-heading">
        <h3 id="cloud-heading">Where it runs in Azure</h3>
        <p>This shows the intended hosted design, not a live inventory of a particular deployment.</p>
        <figure className="architecture-figure" aria-labelledby="cloud-diagram-caption">
          <figcaption id="cloud-diagram-caption">Cloud architecture: connections used by the hosted app</figcaption>
          <div className="cloud-architecture">
            <div className="cloud-entry">
              <div className="architecture-node"><strong>Browser</strong><span>Web workspace</span></div>
              <p>Signs in with <strong>Microsoft Entra External ID</strong> and sends requests over HTTPS.</p>
            </div>
            <div className="cloud-app">
              <div className="architecture-node"><strong>Azure Container Apps</strong><span>Web app and API in one container</span></div>
              <p>The API checks access, coordinates generation, and serves protected audio.</p>
            </div>
            <div className="cloud-services">
              <p>The app connects to:</p>
              <ul>
                <li><strong>Azure Database for PostgreSQL</strong><span>Stores structured records over a private endpoint.</span></li>
                <li><strong>Azure Files</strong><span>Stores audio and working files on a mounted share.</span></li>
                <li><strong>Azure AI services</strong><span>Configured Foundry, Content Safety, and Speech support paid text and voice features.</span></li>
                <li><strong>Azure Key Vault</strong><span>Supplies the database credential to the hosted app.</span></li>
              </ul>
            </div>
          </div>
        </figure>
        <p>Managed identities give the hosted app access to configured Azure services. A local setup can use SQLite and local files instead; available AI features depend on configuration and permissions.</p>
      </section>
    </>
  )
}
