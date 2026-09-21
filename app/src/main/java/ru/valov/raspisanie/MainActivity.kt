package ru.valov.raspisanie

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

// Суббота и воскресенье - только под перенесённые учебные дни.
val DAYS = listOf("Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье")
val DAYS_SHORT = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
val DATE_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMMM", Locale("ru"))
private val HEADER_FMT = DateTimeFormatter.ofPattern("EEE, d MMMM", Locale("ru"))

/** Сколько осталось словами: 68 -> «1 ч 08 мин». */
fun humanMinutes(minutes: Long): String =
    if (minutes >= 60) "" + minutes / 60 + " ч " + (minutes % 60).toString().padStart(2, '0') + " мин"
    else "" + minutes + " мин"

private fun minutesUntil(from: java.time.LocalTime, to: java.time.LocalTime): Long =
    (Duration.between(from, to).seconds + 59) / 60

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = Prefs(this)
        setContent {
            var theme by remember { mutableStateOf(prefs.theme) }
            AppTheme(theme) { App(theme) { theme = it; prefs.theme = it } }
        }
    }

    override fun onResume() {
        super.onResume()
        Notifier.schedule(this)   // на случай, если будильник сбился
    }
}

@Composable
fun App(theme: Int, onTheme: (Int) -> Unit) {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    var klass by remember { mutableStateOf(prefs.klass) }
    var settingsRev by remember { mutableStateOf(0) }   // переносы правятся в настройках
    val schedule = remember(klass, settingsRev) { Schedule.load(ctx, klass) }
    var tab by remember { mutableStateOf(0) }
    var picked by remember { mutableStateOf<Pair<Lesson, LocalDate>?>(null) }
    var notesRev by remember { mutableStateOf(0) }   // чтобы заметки перерисовались после правки

    // ponytail: часы тикают раз в полминуты - для «осталось N мин» точнее не нужно.
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = LocalDateTime.now()
        }
    }

    val askNotify = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        Notifier.schedule(ctx)
    }

    val p = picked
    if (p != null) {
        BackHandler { picked = null }
        LessonScreen(
            schedule, prefs, p.first, p.second, now, notesRev,
            onSaved = { notesRev += 1; Notifier.schedule(ctx) },
            onBack = { picked = null },
            onPick = { l, d -> picked = l to d },
        )
    } else {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            bottomBar = { NavBar(tab) { tab = it } },
        ) { pad ->
            Box(Modifier.padding(pad)) {
                when (tab) {
                    0 -> TodayScreen(schedule, klass, now, prefs, notesRev, { tab = 2 }) { l, d ->
                        picked = l to d
                    }
                    1 -> WeekScreen(schedule, now) { l, d -> picked = l to d }
                    else -> SettingsScreen(
                        prefs, klass, theme,
                        onKlass = { klass = it; prefs.klass = it },
                        onTheme = onTheme,
                        onChanged = { settingsRev += 1; Notifier.schedule(ctx) },
                    )
                }
            }
        }
    }
}

@Composable
private fun NavBar(tab: Int, onTab: (Int) -> Unit) {
    val colors = NavigationBarItemDefaults.colors(
        indicatorColor = MaterialTheme.colorScheme.secondaryContainer,
        selectedIconColor = MaterialTheme.colorScheme.onSecondaryContainer,
        selectedTextColor = MaterialTheme.colorScheme.onSurface,
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceVariant) {
        NavigationBarItem(
            tab == 0, { onTab(0) },
            icon = { Icon(Icons.AutoMirrored.Filled.List, null) },
            label = { Text("Сегодня", fontSize = 12.sp) }, colors = colors,
        )
        NavigationBarItem(
            tab == 1, { onTab(1) },
            icon = { Icon(Icons.Default.DateRange, null) },
            label = { Text("Неделя", fontSize = 12.sp) }, colors = colors,
        )
        NavigationBarItem(
            tab == 2, { onTab(2) },
            icon = { Icon(Icons.Default.Settings, null) },
            label = { Text("Настройки", fontSize = 12.sp) }, colors = colors,
        )
    }
}

// ---------- Сегодня ----------

private enum class Tile { PAST, NOW, NEXT, LATER }

@Composable
private fun TodayScreen(
    schedule: Schedule,
    klass: Int,
    now: LocalDateTime,
    prefs: Prefs,
    notesRev: Int,
    onSettings: () -> Unit,
    onPick: (Lesson, LocalDate) -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val date = now.toLocalDate()
    val lessons = schedule.on(date)
    val currentIdx = lessons.indexOfFirst { now.toLocalTime() < it.end }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 14.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(
                        date.format(HEADER_FMT).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = cs.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("Сегодня", style = MaterialTheme.typography.headlineMedium)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip("Класс " + klass, cs.primaryContainer, cs.onPrimaryContainer)
                        Chip(
                            "Неделя " + schedule.weekOf(date),
                            cs.tertiaryContainer, cs.onTertiaryContainer,
                        )
                    }
                }
                Box(
                    Modifier
                        .size(46.dp)
                        .clip(CircleShape)
                        .background(cs.surfaceContainerHighest)
                        .clickable(onClick = onSettings),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Settings, "Настройки", tint = cs.onSurface)
                }
            }
        }

        if (lessons.isEmpty()) {
            item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 40.dp)) {
                    Text("Пар сегодня нет", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Ближайшие пары смотрите на вкладке «Неделя»",
                        style = MaterialTheme.typography.bodySmall,
                        color = cs.onSurfaceVariant,
                    )
                }
            }
        }

        itemsIndexed(lessons) { i, l ->
            val state = when {
                i < currentIdx || currentIdx < 0 -> Tile.PAST
                i > currentIdx -> Tile.LATER
                now.toLocalTime() < l.start -> Tile.NEXT
                else -> Tile.NOW
            }
            val prev = lessons.getOrNull(i - 1)
            Column {
                if (prev != null) BreakRow(Duration.between(prev.end, l.start).toMinutes())
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                    verticalAlignment = if (state == Tile.PAST || state == Tile.LATER)
                        Alignment.CenterVertically else Alignment.Top,
                ) {
                    Text(
                        l.start.toString(),
                        Modifier.width(46.dp).padding(top = if (state == Tile.PAST || state == Tile.LATER) 0.dp else 20.dp),
                        textAlign = TextAlign.End,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (state == Tile.NOW || state == Tile.NEXT) cs.primary else cs.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(12.dp))
                    // своя заметка на сегодня, а нет - что записали на прошлой такой паре
                    val note = remember(notesRev, l.id, date) {
                        prefs.note(l.id, date).ifEmpty {
                            prefs.lastNote(schedule, l, date)
                                ?.let { "с прошлой пары: " + it.second } ?: ""
                        }
                    }
                    when (state) {
                        Tile.NOW, Tile.NEXT -> HeroTile(l, prev, now, state == Tile.NOW) {
                            onPick(l, date)
                        }
                        Tile.PAST -> PastTile(l) { onPick(l, date) }
                        Tile.LATER -> LaterTile(schedule, l, note) { onPick(l, date) }
                    }
                }
            }
        }
    }
}

@Composable
private fun BreakRow(minutes: Long) {
    Row(
        Modifier.fillMaxWidth().padding(start = 78.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(16.dp).height(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
        Spacer(Modifier.width(8.dp))
        Text(
            "перемена " + humanMinutes(minutes),
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Крупная карточка текущей пары - или отсчёта до следующей на перемене. */
@Composable
private fun HeroTile(
    l: Lesson,
    prev: Lesson?,
    now: LocalDateTime,
    running: Boolean,
    onClick: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val t = now.toLocalTime()
    val faded = cs.onPrimary.copy(alpha = 0.78f)
    val fraction = if (running) {
        val total = Duration.between(l.start, l.end).seconds.toFloat()
        Duration.between(l.start, t).seconds / total
    } else {
        val from = prev?.end ?: t
        val total = Duration.between(from, l.start).seconds.toFloat()
        if (total <= 0f) 1f else Duration.between(from, t).seconds / total
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(cs.primary)
            .clickable(onClick = onClick)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Chip(if (running) "Идёт сейчас" else "Следующая", cs.onPrimary, cs.primary)
            Spacer(Modifier.weight(1f))
            Text(
                l.start.toString() + " – " + l.end,
                fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = faded,
            )
        }
        Column {
            Text(
                l.nameRu,
                style = MaterialTheme.typography.titleLarge,
                color = cs.onPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(7.dp))
            Text(l.roomRu + " · " + l.teacher, fontSize = 13.sp, color = faded, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Column {
            ProgressBar(fraction, cs.onPrimary.copy(alpha = 0.3f), cs.onPrimary)
            Spacer(Modifier.height(11.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Text(
                    if (running) "Осталось " + humanMinutes(minutesUntil(t, l.end))
                    else "Начало через " + humanMinutes(minutesUntil(t, l.start)),
                    style = MaterialTheme.typography.titleMedium,
                    color = cs.onPrimary,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    if (running) "до " + l.end else "в " + l.start,
                    fontSize = 12.sp, color = faded,
                )
            }
        }
    }
}

@Composable
private fun PastTile(l: Lesson, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .height(58.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(cs.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                l.nameRu, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                l.roomRu, fontSize = 12.sp, color = cs.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(Icons.Default.Check, null, Modifier.size(18.dp), tint = cs.onSurfaceVariant)
    }
}

@Composable
private fun LaterTile(schedule: Schedule, l: Lesson, note: String, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    val dot = subjectColors(schedule.subjects.indexOf(l.nameRu)).second
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 86.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(cs.surfaceContainerLowest)
            .border(1.dp, cs.outlineVariant, RoundedCornerShape(22.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                l.nameRu, style = MaterialTheme.typography.bodyLarge,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
                Spacer(Modifier.width(7.dp))
                Text(
                    l.roomRu + " · " + l.teacher,
                    style = MaterialTheme.typography.bodySmall,
                    color = cs.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            if (note.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    note, style = MaterialTheme.typography.bodySmall,
                    color = cs.onTertiaryContainer,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(cs.tertiaryContainer)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight, null,
            Modifier.size(20.dp), tint = cs.onSurfaceVariant,
        )
    }
}
