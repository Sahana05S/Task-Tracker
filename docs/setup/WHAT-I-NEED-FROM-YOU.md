# What I need from you

Two things are waiting on you. Each part below says how long it takes and
exactly what to send back. **Never paste passwords, keys or key files into the
chat.** Nothing here asks you to.

- **Part 1: Sales scoring** (about 5 minutes). This turns on the sales part of
  everyone's score.
- **Part 2: Google Drive automation** (about 1 hour, plus admin access). This
  lets TaskPulse create and file the work files itself.
  **Hold off on Part 2 for now.** You plan to sell TaskPulse to other
  companies, so Drive will instead get a simple "Connect Google Drive" button
  that each company's admin clicks (plan M15.5). Part 2 stays here in case
  you ever want the single-company setup.

You can do them in either order, and Part 2 can wait. The quick "Create work
file" panel on each mission already works without it.

---

## Part 1: Sales scoring (about 5 minutes)

Your workbook scores sales as `(1.5 × BO + BN + 0.75 × BP) ÷ 50`. BN, BO and
BP are three columns on the **B_Summary & Analysis** tab. I need to know what
each column counts.

1. Open your tracker spreadsheet
   ("3_1_2_a_Tasks Tracker - September 2026").
2. Click the **B_Summary & Analysis** tab at the bottom.
3. Scroll right until you reach column **BN**. The column letters are in the
   grey bar at the top.
4. Take a screenshot that shows the **header cells** (the labels at the top)
   of columns **BN, BO and BP**.
   - On Windows, press **Windows + Shift + S** and drag a box around them.
5. Click the **first number cell** under BN. Its formula appears in the bar
   above the sheet, next to *fx*. Take a screenshot of that formula bar.
6. Do the same for **BO** and **BP**.
7. Paste the screenshots into the chat with: "Here are BN, BO and BP."

What happens next: I connect the Sales Log to these columns and check that the
app's numbers match the workbook's. I show you the results before switching on
scoring.

---

## Part 2: Google Drive automation (about 1 hour)

**Before you start:** this needs a **Google Workspace** account (a work or
school Google account where you can create *Shared drives*), and access to its
admin settings. A personal @gmail.com account cannot create Shared drives. If
that's all you have, stop and tell me; there's a different route.

### Step 1: Create a Google Cloud project (5 min)

1. Go to <https://console.cloud.google.com> and sign in with the work account.
2. At the top, click the project picker, then **New project**.
3. Name it **TaskPulse Drive** and click **Create**.

### Step 2: Turn on the Google Drive API (2 min)

1. With **TaskPulse Drive** selected, open
   <https://console.cloud.google.com/apis/library/drive.googleapis.com>.
2. Click **Enable**.

### Step 3: Create the robot account (5 min)

Google calls this a *service account*: an account TaskPulse uses instead of a
person.

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts>.
2. Click **Create service account**.
3. Name it **taskpulse-drive** and click **Create and continue**.
4. Skip the "roles" and "users" steps: click **Continue**, then **Done**.
5. Copy its email address (it ends in `.iam.gserviceaccount.com`). You will
   need it in Steps 5 and 7.

### Step 4: Download its key (3 min). Keep this file private.

1. Click the **taskpulse-drive** account, then the **Keys** tab.
2. Click **Add key**, then **Create new key**, choose **JSON**, then
   **Create**.
3. A `.json` file downloads. **Do not email it, upload it or paste it into
   chat.** It works like a password.

### Step 5: Create the Shared drive and add the robot (5 min)

1. Open <https://drive.google.com>. In the left menu, click **Shared drives**,
   then **New**.
2. Name it **TaskPulse Sandbox**.
3. Open it, click its name at the top, then **Manage members**.
4. Paste the robot's email from Step 3. Set the access to **Content manager**.
   Untick "Notify people", then click **Share** or **Send**.
5. Your browser's address bar now ends in `/drive/folders/<some letters>`.
   Copy that last part; it is the **Shared drive ID**.

### Step 6: Put the sandbox folder inside it (2 min)

You approved the sandbox folder `13G0w_T5i6cKUMiREETYlpH9Z_3G-RyGH` earlier.
It must live inside the **TaskPulse Sandbox** Shared drive:

- Either move that folder into the Shared drive,
- or create a new empty folder there and send me its ID (the last part of its
  address, as in Step 5).

### Step 7: Give the key to TaskPulse without showing it to anyone (5 min)

This copies the key into your local settings file in one go, without
displaying it.

1. Find the downloaded key file, right-click it and choose **Copy as path**.
2. Open the Start menu and type **PowerShell**, then open it.
3. Paste this, replacing the path in the first line with the one you copied:

   ```powershell
   $keyFile = "C:\Users\Sahana\Downloads\taskpulse-drive-key.json"
   $json = Get-Content -Raw $keyFile | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 5
   Add-Content -Path "E:\Task Tracker\.env.local" -Value "`nTASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON='$json'"
   ```

4. Press **Enter**. Nothing is printed if it worked.
5. Move the downloaded key file to a private folder, or delete it. TaskPulse
   now has its own copy.

### Step 8: List who reviews (5 min)

Reviewers get comment access to new work files. Write down each reviewer's
name and the Google email they use, for example:

```
Harish Chakravarthy I  ->  harish@yourcompany.com
```

### Step 9: Tell me you're done

Send a message like this. There's no key in it, so it's safe to paste:

> Drive setup done.
> Robot email: taskpulse-drive@....iam.gserviceaccount.com
> Shared drive ID: ....
> Sandbox folder ID: .... (or "moved the original")
> Reviewers: Harish -> harish@..., ...
> Please resume the Drive integration.

What happens next: I check that TaskPulse can see the folder, then run tests
**only inside that sandbox folder**: create a task folder with
Input/Process/Output, a Doc, a Sheet and a Slides file, and rename and share
one test file. I show you the results. Automatic file creation is switched on
for real missions only after you say so.

---

### If something goes wrong

- **"You don't have permission to create Shared drives"**: your Workspace
  admin must allow it under *Admin console → Apps → Google Workspace → Drive
  and Docs → Sharing settings → Shared drive creation*.
- **"Organization policy prevents creating keys"**: your admin must allow
  service account key creation for this project. Tell me and I'll suggest the
  alternative.
- **Not sure about a step?** Stop and send me a screenshot of the screen
  you're on. Don't include the key file.
