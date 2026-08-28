import ExpoModulesCore
import Foundation
import StoreKit

@available(iOS 15.1, *)
public class KeepIAPModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KeepIAP")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("getProducts") { (productIds: [String], promise: Promise) in
      Task {
        do {
          let products = try await Product.products(for: Set(productIds.filter { !$0.isEmpty }))
          let payload = products
            .sorted { $0.id < $1.id }
            .map { self.productPayload($0) }
          promise.resolve(payload)
        } catch {
          promise.reject("E_KEEP_IAP_PRODUCTS", error.localizedDescription)
        }
      }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String?, promise: Promise) in
      Task {
        do {
          guard let product = try await Product.products(for: [productId]).first else {
            throw NSError(domain: "KeepIAP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Produit Apple introuvable."])
          }

          var options = Set<Product.PurchaseOption>()
          if let rawToken = appAccountToken,
             let token = UUID(uuidString: rawToken) {
            options.insert(.appAccountToken(token))
          }

          let result = try await product.purchase(options: options)
          switch result {
          case .success(let verification):
            switch verification {
            case .verified(let transaction):
              promise.resolve(self.transactionPayload(transaction, verification: verification, status: "PURCHASED"))
            case .unverified(let transaction, _):
              promise.resolve(self.transactionPayload(transaction, verification: verification, status: "UNVERIFIED"))
            }
          case .pending:
            promise.resolve(["status": "PENDING", "productId": productId])
          case .userCancelled:
            promise.resolve(["status": "CANCELLED", "productId": productId])
          @unknown default:
            promise.resolve(["status": "PENDING", "productId": productId])
          }
        } catch {
          promise.reject("E_KEEP_IAP_PURCHASE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("currentEntitlements") { (promise: Promise) in
      Task {
        var output: [[String: Any?]] = []
        for await verification in Transaction.currentEntitlements {
          switch verification {
          case .verified(let transaction):
            output.append(self.transactionPayload(transaction, verification: verification, status: "RESTORED"))
          case .unverified(let transaction, _):
            output.append(self.transactionPayload(transaction, verification: verification, status: "UNVERIFIED"))
          }
        }
        promise.resolve(output)
      }
    }

    AsyncFunction("restorePurchases") { (promise: Promise) in
      Task {
        do {
          // Explicit restore action required by App Review. StoreKit refreshes
          // the signed transaction history, then KEEP reads active entitlements.
          try await AppStore.sync()
          var output: [[String: Any?]] = []
          for await verification in Transaction.currentEntitlements {
            switch verification {
            case .verified(let transaction):
              output.append(self.transactionPayload(transaction, verification: verification, status: "RESTORED"))
            case .unverified(let transaction, _):
              output.append(self.transactionPayload(transaction, verification: verification, status: "UNVERIFIED"))
            }
          }
          promise.resolve(output)
        } catch {
          promise.reject("E_KEEP_IAP_RESTORE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("finish") { (transactionId: String, promise: Promise) in
      Task {
        guard let wanted = UInt64(transactionId) else {
          promise.resolve(false)
          return
        }
        for await verification in Transaction.unfinished {
          switch verification {
          case .verified(let transaction), .unverified(let transaction, _):
            if transaction.id == wanted {
              await transaction.finish()
              promise.resolve(true)
              return
            }
          }
        }
        // Already-finished transactions are safe/idempotent from KEEP's point
        // of view. The server remains the source of truth for entitlements.
        promise.resolve(true)
      }
    }
  }

  private func productPayload(_ product: Product) -> [String: Any] {
    return [
      "id": product.id,
      "displayName": product.displayName,
      "description": product.description,
      "displayPrice": product.displayPrice,
      "price": NSDecimalNumber(decimal: product.price).doubleValue,
      "type": String(describing: product.type),
    ]
  }

  private func transactionPayload(
    _ transaction: Transaction,
    verification: VerificationResult<Transaction>,
    status: String
  ) -> [String: Any?] {
    return [
      "status": status,
      "transactionId": String(transaction.id),
      "originalTransactionId": String(transaction.originalID),
      "productId": transaction.productID,
      "purchaseDateMs": transaction.purchaseDate.timeIntervalSince1970 * 1000,
      "expirationDateMs": transaction.expirationDate?.timeIntervalSince1970.multiplied(by: 1000),
      "revocationDateMs": transaction.revocationDate?.timeIntervalSince1970.multiplied(by: 1000),
      "appAccountToken": transaction.appAccountToken?.uuidString,
      "jwsRepresentation": verification.jwsRepresentation,
    ]
  }
}
