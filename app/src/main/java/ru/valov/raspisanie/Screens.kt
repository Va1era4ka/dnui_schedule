package ru.valov.raspisanie

import android.app.AlarmManager
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

// ---------- Неделя ----------

@Composable
fun WeekScreen(schedule: Schedule, now: LocalDateTime, onPick: (Lesson, LocalDate) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val today = now.toLocalDate()
    var week by rememberSaveable { mutableStateOf(schedule.weekOf(today)) }
    val monday = schedule.mondayOf(week)
    val days = (0..4).map { monday.plusDays(it.toLong()) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 14.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text("Неделя", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            Text(
                monday.format(DATE_FMT) + " – " + monday.plusDays(4).format(DATE_FMT),
                style = MaterialTheme.typography.bodySmall,
                color = cs.onSurfaceVariant,
            )
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StepButton("‹", "Предыдущая неделя") { week -= 1 }
            Box(
                Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(cs.surfaceContainerHighest)
                    .clickable { week = schedule.weekOf(today) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Неделя " + week + (if (week == schedule.weekOf(today)) " · текущая" else ""),
                    fontSize = 13.5.sp, fontWeight = FontWeight.Bold,
                )
            }
            StepButton("›", "Следующая неделя") { week += 1 }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.width(32.dp))
            days.forEachIndexed { i, d ->
                val isToday = d == today
                Box(
                    Modifier
                        .weight(1f)
                        .height(26.dp)
                        .clip(RoundedCornerShape(13.dp))
                        .background(if (isToday) cs.primary else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        DAYS_SHORT[i], fontSize = 12.sp,
                        fontWeight = if (isToday) FontWeight.Bold else FontWeight.SemiBold,
                        color = if (isToday) cs.onPrimary else cs.onSurfaceVariant,
                    )
                }
            }
        }

        schedule.slots.forEach { (n, start) ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.5.dp).height(90.dp),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Column(
                    Modifier.width(32.dp).fillMaxHeight(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.End,
                ) {
                    Text("" + n, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(start.toString(), fontSize = 9.sp, color = cs.onSurfaceVariant)
                }
                days.forEach { d ->
                    val l = schedule.on(d).firstOrNull { it.slot == n }
                    WeekCell(schedule, l, d, now, onPick)
                }
            }
        }

        val present = days.flatMap { schedule.on(it) }.map { it.nameRu }.distinct().sorted()
        Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp)) {
            SectionLabel("Предметы недели")
            present.forEach { name ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(9.dp).clip(CircleShape)
                            .background(subjectColors(schedule.subjects.indexOf(name)).second)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        shortCode(name) + " — " + name,
                        fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (present.isEmpty()) {
                Text(
                    "На этой неделе пар нет",
                    style = MaterialTheme.typography.bodySmall,
                    color = cs.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StepButton(label: String, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .clickable(onClickLabel = description, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun RowScope.WeekCell(
    schedule: Schedule,
    l: Lesson?,
    date: LocalDate,
    now: LocalDateTime,
    onPick: (Lesson, LocalDate) -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    if (l == null) {
        Box(
            Modifier.weight(1f).fillMaxHeight()
                .clip(RoundedCornerShape(14.dp)).background(cs.surfaceVariant)
        )
        return
    }
    val (bg, fg) = subjectColors(schedule.subjects.indexOf(l.nameRu))
    val running = date == now.toLocalDate() &&
        now.toLocalTime() >= l.start && now.toLocalTime() < l.end
    Column(
        Modifier
            .weight(1f)
            .fillMaxHeight()
            .clip(RoundedCornerShape(14.dp))
            .background(bg)
            .then(if (running) Modifier.border(2.5.dp, cs.primary, RoundedCornerShape(14.dp)) else Modifier)
            .clickable { onPick(l, date) }
            .padding(horizontal = 6.dp, vertical = 8.dp),
    ) {
        Text(shortCode(l.nameRu), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = fg, maxLines = 1)
        Spacer(Modifier.height(3.dp))
        Text(shortRoom(l.roomRu), fontSize = 10.sp, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (running) {
            Spacer(Modifier.weight(1f))
            Text("сейчас", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = fg)
        }
    }
}

// ---------- Пара ----------

@Composable
fun LessonScreen(
    schedule: Schedule,
    prefs: Prefs,
    l: Lesson,
    date: LocalDate,
    now: LocalDateTime,
    notesRev: Int,
    onSaved: () -> Unit,
    onBack: () -> Unit,
    onPick: (Lesson, LocalDate) -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val ctx = LocalContext.current
    var note by remember(l.id, date, notesRev) { mutableStateOf(prefs.note(l.id, date)) }
    val t = now.toLocalTime()
    val running = date == now.toLocalDate() && t >= l.start && t < l.end

    Column(
        Modifier
            .fillMaxSize()
            .background(cs.background)
            // экран открывается поверх Scaffold, отступы системных полос берём сами
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 32.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад") }
            Text(
                "" + l.slot + "-я пара · " + DAYS[date.dayOfWeek.value - 1].lowercase(),
                Modifier.weight(1f),
                textAlign = TextAlign.Center,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = cs.onSurfaceVariant,
            )
            Spacer(Modifier.width(48.dp))
        }

        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(cs.primaryContainer)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (running) {
                    Chip("Идёт сейчас", cs.primary, cs.onPrimary)
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    l.start.toString() + " – " + l.end,
                    fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = cs.onPrimaryContainer,
                )
            }
            Column {
                Text(l.nameRu, style = MaterialTheme.typography.titleLarge, color = cs.onPrimaryContainer)
                Spacer(Modifier.height(4.dp))
                Text(l.name, style = MaterialTheme.typography.bodySmall, color = cs.onPrimaryContainer)
            }
            if (running) {
                Column {
                    val total = Duration.between(l.start, l.end).seconds.toFloat()
                    ProgressBar(
                        Duration.between(l.start, t).seconds / total,
                        cs.onPrimaryContainer.copy(alpha = 0.25f),
                        cs.primary,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                        Text(
                            "Осталось " + humanMinutes((Duration.between(t, l.end).seconds + 59) / 60),
                            style = MaterialTheme.typography.titleMedium,
                            color = cs.onPrimaryContainer,
                        )
                        Spacer(Modifier.weight(1f))
                        Text(
                            "прошло " + humanMinutes(Duration.between(l.start, t).toMinutes()),
                            fontSize = 12.sp, color = cs.onPrimaryContainer,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(cs.surfaceContainerLowest)
                .border(1.dp, cs.outlineVariant, RoundedCornerShape(24.dp))
        ) {
            InfoRow(Icons.Default.Person, "Преподаватель", l.teacher)
            InfoDivider()
            InfoRow(Icons.Default.LocationOn, "Аудитория", l.roomRu + " · " + l.building)
            InfoDivider()
            InfoRow(
                Icons.Default.DateRange, "Недели",
                "" + l.weekFrom + "–" + l.weekTo + " · " + DAYS[l.day - 1].lowercase(),
            )
        }

        Spacer(Modifier.height(14.dp))
        Row(
            Modifier.padding(horizontal = 20.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedButton(
                onClick = {
                    val uri = Uri.parse("geo:0,0?q=" + Uri.encode(l.mapQuery))
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                        .onFailure {
                            Toast.makeText(ctx, "Приложение карт не найдено", Toast.LENGTH_SHORT).show()
                        }
                },
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(26.dp),
            ) { Text(l.building + " на карте", fontSize = 13.5.sp) }
            Button(
                onClick = {
                    prefs.setNote(l.id, date, note)
                    onSaved()
                },
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(26.dp),
            ) { Text("Сохранить", fontSize = 13.5.sp) }
        }

        Spacer(Modifier.height(18.dp))
        Column(Modifier.padding(horizontal = 20.dp)) {
            SectionLabel("Заметка на " + date.format(DATE_FMT))
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                placeholder = { Text("Домашнее задание, что принести, где встречаемся") },
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth(),
            )
        }

        val week = schedule.weekOf(date)
        val monday = schedule.mondayOf(week)
        val more = (0..4).map { monday.plusDays(it.toLong()) }
            .flatMap { d -> schedule.on(d).filter { it.nameRu == l.nameRu && !(it.id == l.id && d == date) }.map { it to d } }
        if (more.isNotEmpty()) {
            Spacer(Modifier.height(18.dp))
            Column(Modifier.padding(horizontal = 20.dp)) {
                SectionLabel("Ещё на этой неделе")
                more.forEach { (other, d) ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(cs.surfaceVariant)
                            .clickable { onPick(other, d) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            DAYS[d.dayOfWeek.value - 1] + ", " + other.slot + "-я пара",
                            Modifier.weight(1f), fontSize = 14.sp, fontWeight = FontWeight.Medium,
                        )
                        Text(
                            other.start.toString() + " · " + shortRoom(other.roomRu),
                            fontSize = 13.sp, color = cs.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoRow(icon: ImageVector, label: String, value: String) {
    val cs = MaterialTheme.colorScheme
    Row(
        Modifier.fillMaxWidth().heightIn(min = 58.dp).padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(20.dp), tint = cs.onSurfaceVariant)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(label, fontSize = 12.sp, color = cs.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyLarge, fontSize = 15.sp)
        }
    }
}

@Composable
private fun InfoDivider() {
    Box(
        Modifier
            .padding(start = 52.dp)
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outlineVariant)
    )
}

// ---------- Настройки ----------

@Composable
fun SettingsScreen(prefs: Prefs, klass: Int, onKlass: (Int) -> Unit, onChanged: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    val ctx = LocalContext.current
    var digestOn by remember { mutableStateOf(prefs.digestOn) }
    var digestAt by remember { mutableStateOf(prefs.digestAt) }
    var nextUpOn by remember { mutableStateOf(prefs.nextUpOn) }
    var lead by remember { mutableStateOf(prefs.leadMin) }
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf("Версия " + Updater.installed(ctx)) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 24.dp)
    ) {
        Text(
            "Настройки",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = 14.dp, bottom = 18.dp),
        )

        SectionLabel("Расписание")
        SettingsBlock {
            Row(
                Modifier.fillMaxWidth().padding(start = 18.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Класс", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Segmented(
                    listOf("1", "2"), klass - 1,
                    { onKlass(it + 1); onChanged() },
                    Modifier.width(130.dp),
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        SectionLabel("Уведомления")
        SettingsBlock {
            SwitchRow("Вечером — что завтра", "список пар на следующий день", digestOn) {
                digestOn = it
                prefs.digestOn = it
                onChanged()
            }
            if (digestOn) {
                InfoDivider()
                ActionRow("Время", digestAt.toString()) {
                    TimePickerDialog(ctx, { _, h, m ->
                        digestAt = LocalTime.of(h, m)
                        prefs.digestAt = digestAt
                        onChanged()
                    }, digestAt.hour, digestAt.minute, true).show()
                }
            }
            InfoDivider()
            SwitchRow("Перед концом пары", "какая пара следующая", nextUpOn) {
                nextUpOn = it
                prefs.nextUpOn = it
                onChanged()
            }
            if (nextUpOn) {
                InfoDivider()
                Row(
                    Modifier.fillMaxWidth().padding(start = 18.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("За сколько минут", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Segmented(
                        listOf("5", "10", "15"), listOf(5, 10, 15).indexOf(lead),
                        { lead = listOf(5, 10, 15)[it]; prefs.leadMin = lead; onChanged() },
                        Modifier.width(170.dp),
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        SectionLabel("Приложение")
        SettingsBlock {
            Row(
                Modifier.fillMaxWidth().padding(start = 18.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(update, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = {
                    update = "Проверяю..."
                    scope.launch {
                        update = runCatching { Updater.update(ctx) }
                            .getOrElse { "Ошибка обновления: " + (it.message ?: "нет сети") }
                    }
                }) { Text("Обновить") }
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = ctx.getSystemService(AlarmManager::class.java)
            if (!am.canScheduleExactAlarms()) {
                Spacer(Modifier.height(16.dp))
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(22.dp))
                        .background(cs.tertiaryContainer)
                        .padding(18.dp)
                ) {
                    Text(
                        "Без разрешения уведомления могут опаздывать на ~15 минут",
                        style = MaterialTheme.typography.bodySmall,
                        color = cs.onTertiaryContainer,
                    )
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = {
                            ctx.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
                        },
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                    ) { Text("Разрешить точные будильники", color = cs.onTertiaryContainer) }
                }
            }
        }
    }
}

@Composable
private fun SettingsBlock(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) { content() }
}

@Composable
private fun SwitchRow(title: String, subtitle: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 14.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(14.dp))
        Switch(on, onChange)
    }
}

@Composable
private fun ActionRow(title: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
}
