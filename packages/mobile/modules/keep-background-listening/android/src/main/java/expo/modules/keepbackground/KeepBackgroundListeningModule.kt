package expo.modules.keepbackground

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KeepBackgroundListeningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeepBackgroundListening")

    Function("isSupported") {
      true
    }

    Function("isRunning") {
      KeepMicrophoneForegroundService.isRunning
    }

    AsyncFunction("start") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Contexte Android KEEP indisponible.")
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Permission microphone requise avant le démarrage de l'écoute en arrière-plan.")
      }

      val intent = Intent(context, KeepMicrophoneForegroundService::class.java).apply {
        action = KeepMicrophoneForegroundService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context, intent)
      } else {
        context.startService(intent)
      }
      true
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: return@AsyncFunction true
      val intent = Intent(context, KeepMicrophoneForegroundService::class.java).apply {
        action = KeepMicrophoneForegroundService.ACTION_STOP
      }
      // Si le service a déjà été tué par Android, stopService reste idempotent.
      context.stopService(intent)
      KeepMicrophoneForegroundService.isRunning
    }
  }
}
