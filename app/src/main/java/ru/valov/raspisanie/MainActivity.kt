package ru.valov.raspisanie

import android.Manifest
import android.app.AlarmManager
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAYS = listOf("Понедельник", "Вторник", "Среда", "Четверг", "Пятница")
private val DATE_FMT = DateTimeFormatter.ofPattern("d MMMM", Locale("ru"))

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { App() } }
    }

    override fun onResume() {
        super.onResume()
        Notifier.schedule(this)   // на случай, если будильник сбился
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App() {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    var klass by remember { mutableStateOf(prefs.klass) }
    val schedule = remember(klass) { Schedule.load(ctx, klass) }
    val today = remember { LocalDate.now() }
    var week by remember { mutableStateOf(schedule.weekOf(today)) }
    var settings by remember { mutableStateOf(false) }
    var picked by remember { mutableStateOf<Pair<Lesson, LocalDate>?>(null) }
    var notesRev by remember { mutableStateOf(0) }   // чтобы список перерисовался после правки

    val askNotify = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        Notifier.schedule(ctx)
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Неделя " + week) },
            navigationIcon = {
                TextButton(onClick = { week -= 1 }) { Text("<", fontSize = 22.sp) }
            },
            actions = {
                TextButton(onClick = { week = schedule.weekOf(LocalDate.now()) }) { Text("Сегодня") }
                TextButton(onClick = { week += 1 }) { Text(">", fontSize = 22.sp) }
                TextButton(onClick = { settings = true }) { Text("Настр.") }
            },
        )
    }) { pad ->
        // ponytail: рисуем неделю целиком, ~20 строк - автоскролл к сегодня не нужен
        LazyColumn(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            items(5) { i ->
                val date = schedule.mondayOf(week).plusDays(i.toLong())
                val lessons = schedule.on(date)
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        DAYS[i] + ", " + date.format(DATE_FMT) +
                            (if (date == today) " - сегодня" else ""),
                        fontWeight = FontWeight.Bold,
                        color = if (date == today) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(top = 20.dp, bottom = 6.dp),
                    )
                    if (lessons.isEmpty()) {
                        Text("пар нет", color = MaterialTheme.colorScheme.outline)
                    }
                    lessons.forEach { l ->
                        key(notesRev) {
                            LessonRow(l, prefs.note(l.id, date)) { picked = l to date }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(32.dp)) }
        }
    }

    val p = picked
    if (p != null) {
        LessonDialog(p.first, p.second, prefs) { saved ->
            picked = null
            if (saved) notesRev += 1
        }
    }
    if (settings) {
        SettingsDialog(prefs, klass, onKlass = { klass = it; prefs.klass = it }) {
            settings = false
            Notifier.schedule(ctx)
        }
    }
}

@Composable
private fun LessonRow(l: Lesson, note: String, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp)
    ) {
        Row {
            Text(l.start.toString() + "-" + l.end, fontWeight = FontWeight.Medium)
            Spacer(Modifier.width(12.dp))
            Text(l.nameRu, fontWeight = FontWeight.Medium)
        }
        Text(
            l.name + "  " + l.roomRu + "  " + l.teacher,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.outline,
        )
        if (note.isNotEmpty()) Text(note, fontSize = 13.sp)
    }
    HorizontalDivider()
}

@Composable
private fun LessonDialog(
    l: Lesson,
    date: LocalDate,
    prefs: Prefs,
    onClose: (Boolean) -> Unit,
) {
    val ctx = LocalContext.current
    var note by remember { mutableStateOf(prefs.note(l.id, date)) }
    AlertDialog(
        onDismissRequest = { onClose(false) },
        title = { Text(l.nameRu) },
        text = {
            Column {
                Text(
                    l.name + "\n" + l.start + "-" + l.end + ", " + l.roomRu +
                        "\nПреподаватель: " + l.teacher
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Заметка на " + date.format(DATE_FMT)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = {
                    val uri = Uri.parse("geo:0,0?q=" + Uri.encode(l.mapQuery))
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                        .onFailure {
                            Toast.makeText(ctx, "Приложение карт не найдено", Toast.LENGTH_SHORT)
                                .show()
                        }
                }) { Text("Показать " + l.building + " на карте") }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                prefs.setNote(l.id, date, note)
                Notifier.schedule(ctx)
                onClose(true)
            }) { Text("Сохранить") }
        },
        dismissButton = { TextButton(onClick = { onClose(false) }) { Text("Отмена") } },
    )
}

@Composable
private fun SettingsDialog(
    prefs: Prefs,
    klass: Int,
    onKlass: (Int) -> Unit,
    onClose: () -> Unit,
) {
    val ctx = LocalContext.current
    var digestOn by remember { mutableStateOf(prefs.digestOn) }
    var digestAt by remember { mutableStateOf(prefs.digestAt) }
    var nextUpOn by remember { mutableStateOf(prefs.nextUpOn) }
    var lead by remember { mutableStateOf(prefs.leadMin) }
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf("Версия " + Updater.installed(ctx)) }

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Настройки") },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Класс", Modifier.weight(1f))
                    FilterChip(klass == 1, { onKlass(1) }, { Text("1") })
                    Spacer(Modifier.width(8.dp))
                    FilterChip(klass == 2, { onKlass(2) }, { Text("2") })
                }
                HorizontalDivider(Modifier.padding(vertical = 12.dp))

                Toggle("Вечером - что завтра", digestOn) { digestOn = it; prefs.digestOn = it }
                if (digestOn) {
                    TextButton(onClick = {
                        TimePickerDialog(ctx, { _, h, m ->
                            digestAt = LocalTime.of(h, m)
                            prefs.digestAt = digestAt
                        }, digestAt.hour, digestAt.minute, true).show()
                    }) { Text("Время: " + digestAt) }
                }

                Toggle("Перед концом пары - какая следующая", nextUpOn) {
                    nextUpOn = it
                    prefs.nextUpOn = it
                }
                if (nextUpOn) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("За " + lead + " мин", Modifier.weight(1f))
                        listOf(5, 10, 15).forEach { m ->
                            TextButton(onClick = { lead = m; prefs.leadMin = m }) { Text("" + m) }
                        }
                    }
                }

                HorizontalDivider(Modifier.padding(vertical = 12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(update, Modifier.weight(1f), fontSize = 13.sp)
                    TextButton(onClick = {
                        update = "Проверяю..."
                        scope.launch {
                            update = runCatching { Updater.update(ctx) }
                                .getOrElse {
                                    "Ошибка обновления: " + (it.message ?: "нет сети")
                                }
                        }
                    }) { Text("Обновить") }
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val am = ctx.getSystemService(AlarmManager::class.java)
                    if (!am.canScheduleExactAlarms()) {
                        Text(
                            "Без разрешения уведомления могут опаздывать на ~15 минут:",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.error,
                        )
                        TextButton(onClick = {
                            ctx.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
                        }) { Text("Разрешить точные будильники") }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Готово") } },
    )
}

@Composable
private fun Toggle(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(on, onChange)
    }
}
