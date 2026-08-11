# Apple Watch MVP Install Runbook

This MVP is separate from the macOS island app. It does not change the Mac panel UI or Mac interaction behavior.

## Current Blocker On This Mac

Xcode 26.6, iOS 26.5 Simulator, and watchOS 26.5 Simulator are installed. The paired iPhone can be detected by Xcode.

The remaining blocker for physical iPhone / Apple Watch install is signing: Xcode needs an Apple Development team for both the iPhone and Watch targets. A local macOS signing identity is not enough for iOS/watchOS devices.

## One-Time Project Generation

Install XcodeGen:

```bash
brew install xcodegen
```

Generate the Xcode project:

```bash
cd .
Scripts/create-xcode-project.sh
```

Open:

```bash
open CodexQuotaWatch.xcodeproj
```

## Signing

In Xcode:

- Open Xcode Settings -> Accounts and add the Apple ID that should sign the app.
- Select `CodexQuotaWatch`.
- Select `CodexQuotaWatchWatch`.
- Set the same Team for both targets.
- Keep automatic signing enabled.
- For a Personal Team install, expect the signing profile to expire after about 7 days.

If the Team ID is known, the command-line installer can also receive it directly:

```bash
DEVELOPMENT_TEAM=<team-id> Scripts/install-to-watch.sh <paired-iPhone-UDID>
```

## Install To A Specific Apple Watch

List devices:

```bash
xcrun xctrace list devices
```

Pick the iPhone paired to the target Apple Watch. Then run:

```bash
Scripts/install-to-watch.sh <paired-iPhone-UDID>
```

Xcode installs the iPhone companion app and embeds the Watch app. If watchOS does not auto-install it, open the Apple Watch app on iPhone and install `Codex Quota` from Available Apps.

If the iPhone Watch app shows `This app could not be installed at this time`, check the Watch development trust path before retrying:

The key diagnostic is whether the generated Watch provisioning profile includes the Apple Watch device UDID. If Xcode only lists the paired iPhone and the Watch profile only contains the iPhone UDID, watchOS will reject the install even though the Watch app appears in the iPhone Watch app's available apps list.

1. Keep Apple Watch unlocked, on wrist, near the unlocked iPhone, with Bluetooth and Wi-Fi enabled.
2. Connect the paired iPhone to the Mac with a physical cable.
3. Open Xcode -> Window -> Devices and Simulators.
4. Click the `+` button in the lower-left corner of Device Hub and start the nearby-device pairing flow. Apple notes that Developer Mode may not appear until pairing is initiated from Device Hub.
5. If Apple Watch asks to trust or pair with this Mac, accept it and confirm any matching code.
6. On Apple Watch, enable Developer Mode if it appears in Settings -> Privacy & Security -> Developer Mode, then restart the watch if prompted.
7. In Xcode, confirm the run destination list shows the paired Apple Watch or an iPhone + Apple Watch destination. If only the iPhone appears, the Watch is not yet available for development installs.
8. Delete the old `Codex Quota` from iPhone if needed, then run the current `CodexQuotaWatch` scheme to the paired iPhone again so the embedded Watch app is refreshed.
9. Retry installing `Codex Quota` from the iPhone Watch app.

## Runtime Flow

1. Start the Mac island app.
2. Open the Mac app Settings -> Watch, then enable `Watch Notifications`.
3. Copy the displayed Mac Agent URL. The relay uses fixed port `58732`.
4. On iPhone, enter that Mac Agent URL. If iOS asks for Local Network permission, choose Allow.
5. Enter the 4-digit pairing code shown in the Mac Watch settings page.
6. Tap `配对 Mac`.
7. Tap `立即刷新`.
8. Tap `同步到 Apple Watch`.
9. Open `Codex Quota` on the target Apple Watch.

If Local Network permission was denied earlier, enable it manually on iPhone in Settings -> Privacy & Security -> Local Network -> Codex Quota.

## Always On Limitation

watchOS does not allow a normal third-party app to force the display to stay fully awake forever. The MVP supports Always On by providing a simplified dimmed layout through SwiftUI luminance reduction state. Real permanence depends on system watchOS policy and the user's Apple Watch settings.
