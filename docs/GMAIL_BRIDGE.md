# Gmail Bridge setup

The Gmail Bridge is a small Google Apps Script that you own. The tracker asks it for recent job-related emails only when you open the Gmail suggestions panel. It only reads your mail. It suggests status changes, and nothing changes until you confirm each one.

## Part 1: Create the script

1. Open https://script.google.com in your browser and sign in to the Google account whose Gmail you want to read.
2. Click **New project**.
3. Click the project name at the top left, type `Gmail Bridge`, and press Enter.
4. Delete the sample code in the editor. Open `apps-script/GmailBridge.gs` in this repository, copy all of it, and paste it into the editor.
5. Click the **Save** icon (or press Ctrl+S / Cmd+S).
6. In the function dropdown at the top, select `setup`, then click **Run**.
7. When Google asks you to authorize, click **Review permissions**, choose your account, and approve access to Gmail. You will see a screen that says "Google hasn't verified this app." This is your own script, so it is safe to continue: click **Advanced**, then **Go to Gmail Bridge (unsafe)**, then **Allow**.
8. Click **Execution log** at the bottom of the screen. Find the line that starts with `BRIDGE_KEY:`. Copy the 32-character key after the colon and keep it somewhere safe.

## Part 2: Deploy the script as a web app

1. Click **Deploy** (top right), then **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**. The key from Part 1 is what keeps the script private.
5. Click **Deploy**, then **Done** if prompted.
6. Copy the **Web app URL**. It ends in `/exec`.

## Part 3: Give the tracker the URL and key

1. Open the Cloudflare dashboard at https://dash.cloudflare.com.
2. Click **Workers & Pages**, then click **job-application-tracker-2-0**.
3. Click **Settings**, then **Variables and Secrets**.
4. Click **Add**, choose type **Secret**, name it `GMAIL_BRIDGE_URL`, and paste the `/exec` URL from Part 2. Click **Save** or **Deploy**.
5. Click **Add** again, choose type **Secret**, name it `GMAIL_BRIDGE_KEY`, and paste the key from Part 1. Save.
6. Click **Add** again, choose type **Text**, name it `GMAIL_BRIDGE_OWNER_EMAIL`, and enter the Google address you sign in to the tracker with. Only that account can see Gmail suggestions, so other people who sign up never see your mail. Save.
7. Redeploy the Worker so the new secrets take effect: open the **Deployments** tab and redeploy the latest version.

## Changing the script later

Keep the same URL by creating a new version of the existing deployment instead of a new deployment.

1. Open your Gmail Bridge project at https://script.google.com and edit `GmailBridge.gs`.
2. Click **Save**.
3. Click **Deploy**, then **Manage deployments**.
4. Click the pencil icon on the active deployment.
5. Under **Version**, choose **New version**, then click **Deploy**.

Do not run `setup` again unless you want a new key. If you do, update `GMAIL_BRIDGE_KEY` in Cloudflare to match.

## Turning it off

Either option stops the tracker from reading your mail.

- Option A (keep the script, stop access): click **Deploy**, then **Manage deployments**, click the pencil icon, and choose **Archive**.
- Option B (remove the connection): in Cloudflare, go to Workers & Pages, job-application-tracker-2-0, Settings, Variables and Secrets, and delete `GMAIL_BRIDGE_URL`, `GMAIL_BRIDGE_KEY` and `GMAIL_BRIDGE_OWNER_EMAIL`. Then redeploy the Worker.

To remove the script entirely, go to https://script.google.com, open the project, click the three-dot menu, and choose **Remove**.
