package expo.modules.keepiap

import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.ProductDetailsResponseListener
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KeepIAPModule : Module(), PurchasesUpdatedListener {
  private var billingClient: BillingClient? = null
  private val productCache = mutableMapOf<String, ProductDetails>()
  private var purchasePromise: Promise? = null
  private var requestedProductId: String? = null

  override fun definition() = ModuleDefinition {
    Name("KeepIAP")

    Function("isAvailable") {
      appContext.reactContext != null
    }

    AsyncFunction("getProducts") { productIds: List<String>, promise: Promise ->
      withBillingClient(promise) { client ->
        queryProducts(client, productIds, promise, resolvePayload = true)
      }
    }

    AsyncFunction("purchase") { productId: String, appAccountToken: String?, promise: Promise ->
      withBillingClient(promise) { client ->
        queryProducts(client, listOf(productId), promise, resolvePayload = false) {
          val details = productCache[productId]
          if (details == null) {
            promise.reject("E_KEEP_IAP_PRODUCT", "Produit Google Play introuvable.", null)
            return@queryProducts
          }
          val activity = appContext.currentActivity
          if (activity == null) {
            promise.reject("E_KEEP_IAP_ACTIVITY", "Activité Android indisponible.", null)
            return@queryProducts
          }

          val productParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
          if (details.productType == BillingClient.ProductType.SUBS) {
            val offer = details.subscriptionOfferDetails
              ?.firstOrNull { it.pricingPhases.pricingPhaseList.isNotEmpty() }
              ?: details.subscriptionOfferDetails?.firstOrNull()
            if (offer == null) {
              promise.reject("E_KEEP_IAP_OFFER", "Aucune offre Google Play disponible pour cet abonnement.", null)
              return@queryProducts
            }
            productParamsBuilder.setOfferToken(offer.offerToken)
          }
          val builder = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParamsBuilder.build()))
          if (!appAccountToken.isNullOrBlank()) {
            builder.setObfuscatedAccountId(appAccountToken.take(64))
          }

          purchasePromise = promise
          requestedProductId = productId
          val result = client.launchBillingFlow(activity, builder.build())
          if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            purchasePromise = null
            requestedProductId = null
            promise.reject("E_KEEP_IAP_LAUNCH", billingMessage(result), null)
          }
        }
      }
    }

    AsyncFunction("currentEntitlements") { promise: Promise ->
      queryOwnedSubscriptions(promise)
    }

    AsyncFunction("restorePurchases") { promise: Promise ->
      queryOwnedSubscriptions(promise)
    }

    AsyncFunction("finish") { transactionId: String, promise: Promise ->
      withBillingClient(promise) { client ->
        finishPurchase(client, transactionId, promise)
      }
    }
  }

  override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
    val promise = purchasePromise ?: return
    val requested = requestedProductId
    when (result.responseCode) {
      BillingClient.BillingResponseCode.OK -> {
        val purchase = purchases?.firstOrNull { requested == null || it.products.contains(requested) }
        if (purchase == null) {
          purchasePromise = null
          requestedProductId = null
          promise.reject("E_KEEP_IAP_EMPTY", "Aucun achat Google Play retourné.", null)
          return
        }
        purchasePromise = null
        requestedProductId = null
        promise.resolve(purchasePayload(purchase, if (purchase.purchaseState == Purchase.PurchaseState.PENDING) "PENDING" else "PURCHASED"))
      }
      BillingClient.BillingResponseCode.USER_CANCELED -> {
        purchasePromise = null
        requestedProductId = null
        promise.resolve(mapOf("status" to "CANCELLED", "productId" to requested))
      }
      else -> {
        purchasePromise = null
        requestedProductId = null
        promise.reject("E_KEEP_IAP_PURCHASE", billingMessage(result), null)
      }
    }
  }

  private fun billing(): BillingClient {
    val existing = billingClient
    if (existing != null) return existing
    val context = appContext.reactContext
      ?: throw IllegalStateException("Contexte Android KEEP indisponible.")
    val pending = PendingPurchasesParams.newBuilder()
      .enableOneTimeProducts()
      .build()
    return BillingClient.newBuilder(context)
      .setListener(this)
      .enablePendingPurchases(pending)
      .enableAutoServiceReconnection()
      .build()
      .also { billingClient = it }
  }

  private fun withBillingClient(promise: Promise, block: (BillingClient) -> Unit) {
    val client = try {
      billing()
    } catch (error: Throwable) {
      promise.reject("E_KEEP_IAP_CONTEXT", error.message ?: "Contexte Android indisponible.", error)
      return
    }
    if (client.isReady) {
      block(client)
      return
    }
    client.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
          block(client)
        } else {
          promise.reject("E_KEEP_IAP_SETUP", billingMessage(result), null)
        }
      }

      override fun onBillingServiceDisconnected() {
      }
    })
  }

  private fun isOneTimeProduct(productId: String): Boolean =
    productId.startsWith("com.adelkhatra.keep.free.")

  private fun queryProducts(
    client: BillingClient,
    productIds: List<String>,
    promise: Promise,
    resolvePayload: Boolean,
    after: (() -> Unit)? = null
  ) {
    val unique = productIds.filter { it.isNotBlank() }.distinct()
    if (unique.isEmpty()) {
      if (resolvePayload) promise.resolve(emptyList<Map<String, Any?>>()) else after?.invoke()
      return
    }

    val groups = listOf(
      BillingClient.ProductType.SUBS to unique.filterNot(::isOneTimeProduct),
      BillingClient.ProductType.INAPP to unique.filter(::isOneTimeProduct),
    ).filter { it.second.isNotEmpty() }

    val collected = mutableListOf<ProductDetails>()
    var pending = groups.size
    var failed = false
    groups.forEach { (productType, ids) ->
      val products = ids.map {
        QueryProductDetailsParams.Product.newBuilder()
          .setProductId(it)
          .setProductType(productType)
          .build()
      }
      val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
      client.queryProductDetailsAsync(params, ProductDetailsResponseListener { result, queryResult ->
        if (failed) return@ProductDetailsResponseListener
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
          failed = true
          promise.reject("E_KEEP_IAP_PRODUCTS", billingMessage(result), null)
          return@ProductDetailsResponseListener
        }
        val details = queryResult.productDetailsList
        details.forEach { productCache[it.productId] = it }
        collected.addAll(details)
        pending -= 1
        if (pending == 0) {
          if (resolvePayload) promise.resolve(collected.sortedBy { it.productId }.map { productPayload(it) })
          else after?.invoke()
        }
      })
    }
  }

  private fun queryOwnedSubscriptions(promise: Promise) {
    withBillingClient(promise) { client ->
      val params = QueryPurchasesParams.newBuilder()
        .setProductType(BillingClient.ProductType.SUBS)
        .build()
      client.queryPurchasesAsync(params) { result, purchases ->
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
          promise.reject("E_KEEP_IAP_RESTORE", billingMessage(result), null)
          return@queryPurchasesAsync
        }
        promise.resolve(
          purchases.map {
            purchasePayload(
              it,
              if (it.purchaseState == Purchase.PurchaseState.PENDING) "PENDING" else "RESTORED"
            )
          }
        )
      }
    }
  }

  private fun productPayload(product: ProductDetails): Map<String, Any?> {
    val offer = product.subscriptionOfferDetails?.firstOrNull()
    val phase = offer?.pricingPhases?.pricingPhaseList?.lastOrNull()
    val oneTime = product.oneTimePurchaseOfferDetails
    val priceMicros = oneTime?.priceAmountMicros ?: phase?.priceAmountMicros ?: 0L
    return mapOf(
      "id" to product.productId,
      "displayName" to product.name,
      "description" to product.description,
      "displayPrice" to (oneTime?.formattedPrice ?: phase?.formattedPrice ?: ""),
      "price" to (priceMicros.toDouble() / 1_000_000.0),
      "type" to product.productType
    )
  }

  private fun finishPurchase(client: BillingClient, transactionId: String, promise: Promise) {
    val types = listOf(BillingClient.ProductType.INAPP, BillingClient.ProductType.SUBS)
    fun queryAt(index: Int) {
      if (index >= types.size) {
        promise.resolve(true)
        return
      }
      val productType = types[index]
      val params = QueryPurchasesParams.newBuilder().setProductType(productType).build()
      client.queryPurchasesAsync(params) { result, purchases ->
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
          promise.reject("E_KEEP_IAP_QUERY", billingMessage(result), null)
          return@queryPurchasesAsync
        }
        val purchase = purchases.firstOrNull { it.purchaseToken == transactionId }
        if (purchase == null) {
          queryAt(index + 1)
          return@queryPurchasesAsync
        }
        if (productType == BillingClient.ProductType.INAPP) {
          val consume = ConsumeParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
          client.consumeAsync(consume) { consumeResult, _ ->
            if (consumeResult.responseCode == BillingClient.BillingResponseCode.OK) promise.resolve(true)
            else promise.reject("E_KEEP_IAP_CONSUME", billingMessage(consumeResult), null)
          }
          return@queryPurchasesAsync
        }
        if (purchase.isAcknowledged) {
          promise.resolve(true)
          return@queryPurchasesAsync
        }
        val ack = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
        client.acknowledgePurchase(ack) { ackResult ->
          if (ackResult.responseCode == BillingClient.BillingResponseCode.OK) promise.resolve(true)
          else promise.reject("E_KEEP_IAP_ACK", billingMessage(ackResult), null)
        }
      }
    }
    queryAt(0)
  }

  private fun purchasePayload(purchase: Purchase, status: String): Map<String, Any?> {
    return mapOf(
      "status" to status,
      "transactionId" to purchase.purchaseToken,
      "originalTransactionId" to purchase.purchaseToken,
      "productId" to purchase.products.firstOrNull(),
      "purchaseDateMs" to purchase.purchaseTime,
      "expirationDateMs" to null,
      "revocationDateMs" to null,
      "appAccountToken" to null,
      "purchaseToken" to purchase.purchaseToken,
      "packageName" to (appContext.reactContext?.packageName ?: ""),
      "platform" to "android"
    )
  }

  private fun billingMessage(result: BillingResult): String {
    return "Google Play Billing " + result.responseCode + ": " + result.debugMessage
  }
}
