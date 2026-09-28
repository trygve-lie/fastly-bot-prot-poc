import { html } from 'hono/html';

const conversations = [
  { name: 'Erik Hansen',  preview: 'Is the apartment still available?',   time: '2h ago' },
  { name: 'Marte Larsen', preview: 'Can we arrange a test drive?',         time: 'Yesterday' },
  { name: 'Lars Johansen', preview: 'What is the lowest price you accept?', time: 'Mon' },
];

export const messagingPage = html`
  <div class="page-main wa-stack wa-gap-l">
    <h1 class="wa-heading-xl">Messages</h1>

    <div class="wa-stack wa-gap-s">
      ${conversations.map(c => html`
        <a href="#" class="listing-link">
          <wa-card>
            <div class="wa-flank wa-align-items-start wa-gap-s">
              <wa-avatar label="${c.name} avatar">
                <wa-icon slot="icon" name="circle-user"></wa-icon>
              </wa-avatar>
              <div class="grow wa-split wa-align-items-start">
                <div class="wa-stack wa-gap-2xs">
                  <span class="wa-heading-s">${c.name}</span>
                  <span class="wa-body-s">${c.preview}</span>
                </div>
                <span class="wa-caption-s">${c.time}</span>
              </div>
            </div>
          </wa-card>
        </a>`)}
    </div>
  </div>`;
