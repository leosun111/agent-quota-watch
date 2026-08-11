#!/usr/bin/env bash

watch_project_text_is_installable() {
  local project_text="${1:-}"
  local asset_reference_count

  [[ "$project_text" == *"PRODUCT_BUNDLE_IDENTIFIER = com.example.CodexQuotaWatch;"* ]] || return 1
  [[ "$project_text" == *"PRODUCT_BUNDLE_IDENTIFIER = com.example.CodexQuotaWatch.watchkitapp;"* ]] || return 1
  [[ "$project_text" == *"INFOPLIST_KEY_WKCompanionAppBundleIdentifier = com.example.CodexQuotaWatch;"* ]] || return 1
  [[ "$project_text" == *"INFOPLIST_FILE = iPhone/Info.plist;"* ]] || return 1
  [[ "$project_text" == *"<key>NSAllowsLocalNetworking</key>"* ]] || return 1
  [[ "$project_text" == *"<true/>"* ]] || return 1

  asset_reference_count="$(grep -c "Assets.xcassets in Resources" <<<"$project_text" || true)"
  [[ "$asset_reference_count" -ge 2 ]]
}

watch_device_is_available() {
  local requested_udid="${1:-}"
  local device_list="${2:-}"
  local available_devices
  local matching_line

  [[ -n "$requested_udid" ]] || return 1
  available_devices="${device_list%%== Devices Offline ==*}"
  available_devices="${available_devices%%== Simulators ==*}"
  matching_line="$(grep -F "($requested_udid)" <<<"$available_devices" | head -n 1 || true)"

  [[ -n "$matching_line" ]] || return 1
  [[ "$matching_line" != *"(Offline)"* ]] || return 1
  [[ "$matching_line" != *"(Unavailable)"* ]] || return 1
}

watch_device_list_has_physical_watch() {
  local device_list="${1:-}"
  local available_devices

  available_devices="${device_list%%== Devices Offline ==*}"
  available_devices="${available_devices%%== Simulators ==*}"
  grep -Eq "Apple Watch|Watch Ultra|Watch Series|Watch SE" <<<"$available_devices"
}

watch_profile_is_usable() {
  local expiration_date="${1:-}"
  local current_date="${2:-}"
  local provisioned_device_count="${3:-0}"
  local first_provisioned_device="${4:-}"
  local iphone_udid="${5:-}"

  [[ -n "$expiration_date" && -n "$current_date" ]] || return 1
  [[ "$expiration_date" > "$current_date" ]] || return 1
  [[ "$provisioned_device_count" =~ ^[0-9]+$ ]] || return 1
  [[ "$provisioned_device_count" -gt 0 ]] || return 1

  if [[ "$provisioned_device_count" -eq 1 && "$first_provisioned_device" == "$iphone_udid" ]]; then
    return 1
  fi
}

watch_launch_guidance() {
  local launch_error="${1:-}"

  case "$launch_error" in
    *"Developer App Certificate is not trusted"*|*"Untrusted Developer"*)
      printf '%s\n' "请在 iPhone 上打开“设置 > 通用 > VPN 与设备管理”，选择 Apple Development 开发者并点“信任”，然后重新打开 Codex Quota。"
      ;;
    *"provision"*|*"Provision"*|*"profile"*|*"Profile"*|*"integrity could not be verified"*)
      printf '%s\n' "请删除 iPhone 和 Apple Watch 上的旧 Codex Quota，保持两台设备解锁并连接 Xcode，再重新签名安装。"
      ;;
    *)
      printf '%s\n' "请在 Xcode 的 Devices and Simulators 中确认 iPhone 与 Apple Watch 均在线，再查看本次 Launch 日志。"
      ;;
  esac
}
