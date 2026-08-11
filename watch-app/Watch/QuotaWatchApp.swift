import SwiftUI

@main
struct QuotaWatchApp: App {
    @State private var store = QuotaWatchStore()

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(store)
        }
    }
}

