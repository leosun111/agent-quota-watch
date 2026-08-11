import SwiftUI

@main
struct QuotaPhoneApp: App {
    @State private var store = QuotaPhoneStore()

    var body: some Scene {
        WindowGroup {
            PhoneRootView()
                .environment(store)
        }
    }
}

