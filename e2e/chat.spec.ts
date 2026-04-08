/**
 * chat.spec.ts
 *
 * End-to-end tests for CipherChat using Playwright.
 * Tests run against real backend + frontend dev servers.
 *
 * Two browser contexts simulate two separate users (separate IndexedDB,
 * separate socket connections) interacting in the same room.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create an isolated browser context (separate cookies, storage, etc.) */
async function newUser(browser: import('@playwright/test').Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

/** Wait for peer status label to show specific text */
async function waitForPeerStatus(page: Page, status: string) {
  await expect(page.locator(`text=${status}`).first()).toBeVisible({
    timeout: 10_000,
  });
}

/** Type a message and press Enter to send */
async function sendMessage(page: Page, text: string) {
  const input = page.getByLabel('Message input');
  await input.fill(text);
  await input.press('Enter');
}

/** Wait for a message bubble containing specific text to appear */
async function waitForMessage(page: Page, text: string) {
  await expect(page.locator(`text="${text}"`).first()).toBeVisible({
    timeout: 5_000,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Room creation and joining', () => {
  test('User A can create a room and see the waiting state', async ({
    browser,
  }) => {
    const { context, page } = await newUser(browser);

    await page.goto('/');
    await page.getByText('Create encrypted room').click();

    // Should navigate to /room/<uuid>
    await expect(page).toHaveURL(/\/room\/[0-9a-f-]{36}/);

    // Should show "Waiting" peer status
    await waitForPeerStatus(page, 'Waiting');

    // Should show "Copy invite link" button
    await expect(page.getByText('Copy invite link')).toBeVisible();

    // Should show "Waiting for peer" heading
    await expect(page.getByText('Waiting for peer')).toBeVisible();

    await context.close();
  });

  test('User B can join via room URL and both see Connected', async ({
    browser,
  }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    // Alice creates room
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    const roomUrl = alice.page.url();

    // Bob joins the same room URL
    await bob.page.goto(roomUrl);

    // Both should see "Connected"
    await waitForPeerStatus(alice.page, 'Connected');
    await waitForPeerStatus(bob.page, 'Connected');

    await alice.context.close();
    await bob.context.close();
  });
});

test.describe('Messaging', () => {
  test('Users can exchange encrypted messages', async ({ browser }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    // Alice creates room, Bob joins
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    const roomUrl = alice.page.url();
    await bob.page.goto(roomUrl);

    // Wait for connection
    await waitForPeerStatus(alice.page, 'Connected');
    await waitForPeerStatus(bob.page, 'Connected');

    // Alice sends a message
    await sendMessage(alice.page, 'Hello Bob!');
    await waitForMessage(alice.page, 'Hello Bob!');
    await waitForMessage(bob.page, 'Hello Bob!');

    // Bob replies
    await sendMessage(bob.page, 'Hi Alice!');
    await waitForMessage(bob.page, 'Hi Alice!');
    await waitForMessage(alice.page, 'Hi Alice!');

    await alice.context.close();
    await bob.context.close();
  });

  test('Unicode and emoji messages are delivered correctly', async ({
    browser,
  }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    await bob.page.goto(alice.page.url());

    await waitForPeerStatus(alice.page, 'Connected');
    await waitForPeerStatus(bob.page, 'Connected');

    await sendMessage(alice.page, 'Xin chào! 🔐🌍');
    await waitForMessage(bob.page, 'Xin chào! 🔐🌍');

    await alice.context.close();
    await bob.context.close();
  });
});

test.describe('Peer disconnect', () => {
  test('Shows Offline when peer closes tab', async ({ browser }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    await bob.page.goto(alice.page.url());

    await waitForPeerStatus(alice.page, 'Connected');
    await waitForPeerStatus(bob.page, 'Connected');

    // Bob closes tab (disconnect)
    await bob.page.close();

    // Alice should see "Offline"
    await waitForPeerStatus(alice.page, 'Offline');

    await alice.context.close();
    await bob.context.close();
  });

  test('Shows Offline when peer navigates away', async ({ browser }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    await bob.page.goto(alice.page.url());

    await waitForPeerStatus(alice.page, 'Connected');

    // Bob navigates back to home (triggers leave)
    await bob.page.getByLabel('Back to home').click();

    // Alice should see "Offline"
    await waitForPeerStatus(alice.page, 'Offline');

    await alice.context.close();
    await bob.context.close();
  });
});

test.describe('Channel nickname', () => {
  test('User can set and see a channel nickname', async ({ browser }) => {
    const { context, page } = await newUser(browser);

    // Create room and establish connection with a second user
    const bob = await newUser(browser);
    await page.goto('/');
    await page.getByText('Create encrypted room').click();
    await bob.page.goto(page.url());
    await waitForPeerStatus(page, 'Connected');

    // Click the room name to edit
    const roomNameButton = page.locator('button[title="Click to rename"]');
    await roomNameButton.click();

    // Type a nickname
    const nameInput = page.getByPlaceholder('Name this chat…');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Work Chat');
    await nameInput.press('Enter');

    // Nickname should now be visible as the room title
    await expect(page.getByText('Work Chat')).toBeVisible();

    await context.close();
    await bob.context.close();
  });
});

test.describe('Channel list', () => {
  test('Previously joined room appears in the channel list on homepage', async ({
    browser,
  }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    // Create room, connect, set nickname
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    const roomUrl = alice.page.url();
    await bob.page.goto(roomUrl);
    await waitForPeerStatus(alice.page, 'Connected');

    // Set a nickname
    await alice.page.locator('button[title="Click to rename"]').click();
    const nameInput = alice.page.getByPlaceholder('Name this chat…');
    await nameInput.fill('My Test Room');
    await nameInput.press('Enter');

    // Exchange a message so there's a preview
    await sendMessage(alice.page, 'Hello from E2E test');
    await waitForMessage(bob.page, 'Hello from E2E test');

    // Go back to homepage
    await alice.page.getByLabel('Back to home').click();
    await expect(alice.page).toHaveURL('/');

    // Channel list should show the room
    await expect(alice.page.getByText('My Test Room')).toBeVisible();
    await expect(
      alice.page.getByText('You: Hello from E2E test'),
    ).toBeVisible();

    await alice.context.close();
    await bob.context.close();
  });

  test('Clicking a channel navigates back to the room', async ({ browser }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    // Create and join room
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    const roomUrl = alice.page.url();
    const roomId = roomUrl.split('/room/')[1];
    await bob.page.goto(roomUrl);
    await waitForPeerStatus(alice.page, 'Connected');

    // Send a message
    await sendMessage(alice.page, 'Persisted message');
    await waitForMessage(alice.page, 'Persisted message');

    // Go back to homepage
    await alice.page.getByLabel('Back to home').click();

    // Click the channel in the list
    await alice.page.getByText('Recent conversations').waitFor();
    // The channel row contains the truncated room ID
    const channelRow = alice.page.locator(
      `button:has-text("${roomId.slice(0, 8)}")`,
    );
    await channelRow.click();

    // Should navigate back to the room
    await expect(alice.page).toHaveURL(new RegExp(`/room/${roomId}`));

    // Chat history should be restored from IndexedDB
    await waitForMessage(alice.page, 'Persisted message');

    await alice.context.close();
    await bob.context.close();
  });

  test('User can delete a channel from the list', async ({ browser }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    // Create room, connect, go back
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    await bob.page.goto(alice.page.url());
    await waitForPeerStatus(alice.page, 'Connected');

    await alice.page.getByLabel('Back to home').click();
    await alice.page.getByText('Recent conversations').waitFor();

    // Hover over channel row to reveal delete button
    const channelRow = alice.page.locator('.group.relative').first();
    await channelRow.hover();

    // Click delete button
    await channelRow.getByLabel('Delete channel').click();

    // Confirm deletion
    await alice.page.getByText('Yes').click();

    // Channel should be removed — "Recent conversations" should no longer
    // be visible if it was the only channel
    await expect(alice.page.getByText('Recent conversations')).not.toBeVisible({
      timeout: 3_000,
    });

    await alice.context.close();
    await bob.context.close();
  });
});

test.describe('Session recovery', () => {
  test('Chat history is restored when revisiting the same room', async ({
    browser,
  }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);

    // Create room and exchange messages
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    const roomUrl = alice.page.url();
    await bob.page.goto(roomUrl);
    await waitForPeerStatus(alice.page, 'Connected');

    await sendMessage(alice.page, 'Message one');
    await waitForMessage(bob.page, 'Message one');
    await sendMessage(bob.page, 'Message two');
    await waitForMessage(alice.page, 'Message two');

    // Alice leaves and comes back
    await alice.page.getByLabel('Back to home').click();
    await alice.page.goto(roomUrl);

    // History should be restored from IndexedDB
    await waitForMessage(alice.page, 'Message one');
    await waitForMessage(alice.page, 'Message two');

    await alice.context.close();
    await bob.context.close();
  });
});

test.describe('Room full rejection', () => {
  test('Third user is rejected and redirected with notification', async ({
    browser,
  }) => {
    const alice = await newUser(browser);
    const bob = await newUser(browser);
    const charlie = await newUser(browser);

    // Alice and Bob fill the room
    await alice.page.goto('/');
    await alice.page.getByText('Create encrypted room').click();
    const roomUrl = alice.page.url();
    await bob.page.goto(roomUrl);
    await waitForPeerStatus(alice.page, 'Connected');

    // Charlie tries to join the full room
    await charlie.page.goto(roomUrl);

    // Charlie should be redirected to homepage with "Room is full" banner
    await expect(charlie.page).toHaveURL('/');
    await expect(charlie.page.getByText('Room is full')).toBeVisible({
      timeout: 5_000,
    });

    await alice.context.close();
    await bob.context.close();
    await charlie.context.close();
  });
});
