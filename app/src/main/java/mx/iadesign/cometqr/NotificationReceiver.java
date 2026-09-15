package mx.iadesign.cometqr;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;

public class NotificationReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "comet_checks";
    public static final String EXTRA_HOUR = "hour";
    public static final String EXTRA_MINUTE = "minute";
    public static final String EXTRA_LABEL = "label";
    public static final String EXTRA_REQUEST = "requestCode";

    @Override
    public void onReceive(Context context, Intent intent) {
        int hour = intent.getIntExtra(EXTRA_HOUR, 12);
        int minute = intent.getIntExtra(EXTRA_MINUTE, 0);
        int requestCode = intent.getIntExtra(EXTRA_REQUEST, 1200);
        String label = intent.getStringExtra(EXTRA_LABEL);
        if (label == null || label.isEmpty()) label = String.format("%02d:%02d", hour, minute);

        createChannel(context);

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openApp.putExtra("open_check", label);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                requestCode + 10000,
                openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new android.app.Notification.Builder(context, CHANNEL_ID)
                : new android.app.Notification.Builder(context);

        builder.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("COMET · Comprobación pendiente")
                .setContentText("Realiza la comprobación programada de las " + label + ".")
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setPriority(android.app.Notification.PRIORITY_HIGH);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(requestCode, builder.build());

        // Programar la siguiente del mismo horario para el día siguiente.
        schedule(context, hour, minute, requestCode, label);
    }

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Comprobaciones COMET",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Recordatorios de comprobación de puesta a punto COMET");
            channel.enableVibration(true);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(channel);
        }
    }

    public static void schedule(Context context, int hour, int minute, int requestCode, String label) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }

        Intent alarmIntent = new Intent(context, NotificationReceiver.class);
        alarmIntent.putExtra(EXTRA_HOUR, hour);
        alarmIntent.putExtra(EXTRA_MINUTE, minute);
        alarmIntent.putExtra(EXTRA_LABEL, label);
        alarmIntent.putExtra(EXTRA_REQUEST, requestCode);

        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                requestCode,
                alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pending);
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), pending);
        }
    }
}
