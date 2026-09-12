package expo.modules.keepbackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class KeepMicrophoneForegroundService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.keepbackground.START"
    const val ACTION_STOP = "expo.modules.keepbackground.STOP"
    const val CHANNEL_ID = "keep_listening"
    const val NOTIFICATION_ID = 7821

    // Adel (01/09/2026) : "même si le téléphone se met en veille, je veux
    // qu'il continue à écouter tant qu'il y a du son." Un service en premier
    // plan seul ne suffit pas -- sans wake lock, Doze/les gestionnaires de
    // batterie agressifs (Samsung, Xiaomi...) peuvent throttler le CPU une
    // fois l'écran éteint, même avec la notification persistante affichée.
    // Le timeout de sécurité (2h) évite une fuite de batterie si stopListening
    // n'était jamais appelé (crash, kill brutal du process).
    private const val WAKE_LOCK_TAG = "Loki:BackgroundListening"
    private const val WAKE_LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000L

    @Volatile
    var isRunning: Boolean = false
      private set
  }

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopListening()
      return START_NOT_STICKY
    }

    startListening()
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    isRunning = false
    releaseWakeLock()
    super.onDestroy()
  }

  private fun startListening() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    acquireWakeLock()
    isRunning = true
  }

  private fun stopListening() {
    isRunning = false
    releaseWakeLock()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val powerManager = getSystemService(POWER_SERVICE) as? PowerManager ?: return
    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
      setReferenceCounted(false)
      acquire(WAKE_LOCK_TIMEOUT_MS)
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Écoute KEEP",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "KEEP continue l'écoute musicale demandée par l'utilisateur."
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent().setPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("KEEP écoute")
      .setContentText("Analyse musicale active — touche pour revenir à KEEP")
      .setContentIntent(pendingIntent)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }
}
