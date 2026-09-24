package ru.valov.raspisanie

import android.app.AlarmManager
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

// ---------- Неделя ----------

private val CELL_H = 90.dp
private val CELL_GAP = 5.dp

/** Высота плитки на [span] слотов - вместе со съеденными промежутками. */
private fun cellHeight(span: Int) = maxOf(span, 1).let { CELL_H * it + CELL_GAP * (it - 1) }

@Composable
fun WeekScreen(schedule: Schedule, now: LocalDateTime, onPick: (Lesson, LocalDate) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val today = now.toLocalDate()
    val thisWeek = schedule.weekOf(today)
    // Недели листаются вбок, кнопки ‹ › гонят тот же пейджер.
    val pager = rememberPagerState(SWIPE_MID) { SWIPE_PAGES }
    val scope = rememberCoroutineScope()
    val week = thisWeek + pager.currentPage - SWIPE_MID
    fun goTo(w: Int) {
        scope.launch { pager.animateScrollToPage(SWIPE_MID + w - thisWeek) }
    }
    // Сб и Вс в сетке появляются, только если туда перенесли учебный день.
    fun daysOf(w: Int): List<LocalDate> {
        val mon = schedule.mondayOf(w)
        return (0..6).map { mon.plusDays(it.toLong()) }
            .filter { it.dayOfWeek.value <= 5 || schedule.on(it).isNotEmpty() }
    }
    val monday = schedule.mondayOf(week)
    val days = daysOf(week)

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
                monday.format(DATE_FMT) + " – " + days.last().format(DATE_FMT),
                style = MaterialTheme.typography.bodySmall,
                color = cs.onSurfaceVariant,
            )
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StepButton("‹", "Предыдущая неделя") { goTo(week - 1) }
            Box(
                Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(cs.surfaceContainerHighest)
                    .clickable { goTo(thisWeek) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Неделя " + week + (if (week == thisWeek) " · текущая" else ""),
                    fontSize = 13.5.sp, fontWeight = FontWeight.Bold,
                )
            }
            StepButton("›", "Следующая неделя") { goTo(week + 1) }
        }

        HorizontalPager(pager) { page ->
            val appear = page == pager.settledPage
            val shown = daysOf(thisWeek + page - SWIPE_MID)
            Column {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Spacer(Modifier.width(32.dp))
                    shown.forEach { d ->
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
                                DAYS_SHORT[d.dayOfWeek.value - 1], fontSize = 12.sp,
                                fontWeight = if (isToday) FontWeight.Bold else FontWeight.SemiBold,
                                color = if (isToday) cs.onPrimary else cs.onSurfaceVariant,
                            )
                        }
                    }
                }

                // Сетка собирается колонками по дням: у выходного тогда одна плашка на всю высоту.
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.5.dp),
                    horizontalArrangement = Arrangement.spacedBy(CELL_GAP),
                ) {
                    Column(
                        Modifier.width(32.dp),
                        verticalArrangement = Arrangement.spacedBy(CELL_GAP),
                        horizontalAlignment = Alignment.End,
                    ) {
                        schedule.slots.forEach { (n, start) ->
                            Column(
                                Modifier.height(CELL_H),
                                verticalArrangement = Arrangement.Center,
                                horizontalAlignment = Alignment.End,
                            ) {
                                Text("" + n, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                Text(start.toString(), fontSize = 9.sp, color = cs.onSurfaceVariant)
                            }
                        }
                    }
                    shown.forEachIndexed { i, d ->
                        if (schedule.isHoliday(d)) {
                            HolidayCell(schedule.slots.size)
                        } else {
                            Column(
                                Modifier.weight(1f).appearIn(i, appear),
                                verticalArrangement = Arrangement.spacedBy(CELL_GAP),
                            ) {
                                schedule.column(d).forEach { (l, span) ->
                                    WeekCell(schedule, l, d, now, span, onPick)
                                }
                            }
                        }
                    }
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

/** Помеченный выходной: 休息日 столбиком вместо четырёх пустых плиток. */
@Composable
private fun RowScope.HolidayCell(slots: Int) {
    Column(
        Modifier
            .weight(1f)
            .height(cellHeight(slots))
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        "休息日".forEach { c ->
            Text(
                c.toString(),
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun WeekCell(
    schedule: Schedule,
    l: Lesson?,
    date: LocalDate,
    now: LocalDateTime,
    span: Int,
    onPick: (Lesson, LocalDate) -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    if (l == null) {
        Box(
            Modifier.fillMaxWidth().height(cellHeight(span))
                .clip(RoundedCornerShape(14.dp)).background(cs.surfaceVariant)
        )
        return
    }
    val (bg, fg) = subjectColors(schedule.subjects.indexOf(l.nameRu))
    val running = date == now.toLocalDate() &&
        now.toLocalTime() >= l.start && now.toLocalTime() < l.end
    Column(
        Modifier
            .fillMaxWidth()
            .height(cellHeight(span))
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
    // Даты следующих пар по этому предмету: докуда заметку показывать.
    val upcoming = remember(l.id, date) {
        schedule.later(l, date).map { it.second }.distinct().take(5).toList()
    }
    var until by remember(l.id, date, notesRev) {
        mutableStateOf(prefs.noteUntil(l.id, date) ?: upcoming.firstOrNull())
    }
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
                    Chip("Идёт сейчас", cs.primary, cs.onPrimary, Modifier.pulsing())
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
                    prefs.setNote(l.id, date, note, until)
                    onSaved()
                },
                modifier = Modifier.weight(1f).height(52.dp),
                shape = RoundedCornerShape(26.dp),
            ) { Text("Сохранить", fontSize = 13.5.sp) }
        }

        val last = remember(l.id, date, notesRev) { prefs.lastNote(schedule, l, date) }
        if (last != null) {
            Spacer(Modifier.height(18.dp))
            Column(Modifier.padding(horizontal = 20.dp)) {
                SectionLabel("С прошлой пары · " + last.first.format(DATE_FMT))
                Text(
                    last.second,
                    style = MaterialTheme.typography.bodyMedium,
                    color = cs.onTertiaryContainer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(cs.tertiaryContainer)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                )
            }
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
            if (upcoming.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                SectionLabel("Показывать до пары")
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    upcoming.forEach { d ->
                        val on = d == until
                        Text(
                            d.format(DATE_FMT),
                            color = if (on) cs.onPrimary else cs.onSurface,
                            fontSize = 13.sp,
                            fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier
                                .clip(RoundedCornerShape(16.dp))
                                .background(if (on) cs.primary else cs.surfaceVariant)
                                .clickable { until = d }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }
            }
        }

        val week = schedule.weekOf(date)
        val monday = schedule.mondayOf(week)
        val more = (0..6).map { monday.plusDays(it.toLong()) }
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
fun SettingsScreen(
    prefs: Prefs,
    klass: Int,
    theme: Int,
    onKlass: (Int) -> Unit,
    onSource: () -> Unit,
    onTheme: (Int) -> Unit,
    onChanged: () -> Unit,
) {
    val cs = MaterialTheme.colorScheme
    val ctx = LocalContext.current
    var digestOn by remember { mutableStateOf(prefs.digestOn) }
    var digestAt by remember { mutableStateOf(prefs.digestAt) }
    var nextUpOn by remember { mutableStateOf(prefs.nextUpOn) }
    var lead by remember { mutableStateOf(prefs.leadMin) }
    var shifts by remember { mutableStateOf(prefs.shifts) }
    var pending by remember { mutableStateOf<LocalDate?>(null) }   // дата ждёт выбора дня
    var showPast by remember { mutableStateOf(false) }
    val save: (Map<LocalDate, Int>) -> Unit = { shifts = it; prefs.shifts = it; onChanged() }
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf("Версия " + Updater.installed(ctx)) }
    var autoUpdate by remember { mutableStateOf(prefs.autoUpdate) }

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

        SectionLabel("Оформление")
        Segmented(
            listOf("Системная", "Светлая", "Тёмная"), theme, onTheme,
            Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(16.dp))
        SectionLabel("Расписание")
        SettingsBlock {
            val bundled = prefs.source == "bundled"
            ActionRow("Источник", if (bundled) "Встроенное" else "Свой файл", onSource)
            if (bundled) {
                InfoDivider()
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
        }

        Spacer(Modifier.height(16.dp))
        SectionLabel("Переносы и выходные")
        SettingsBlock {
            // Прошедшие правки из памяти не выкидываем (по ним ищется прошлая пара),
            // но в списке держим свёрнутыми - иначе он растёт весь семестр.
            val today = remember { LocalDate.now() }
            val (past, upcoming) = shiftRanges(shifts).partition { it.to.isBefore(today) }
            if (shifts.isEmpty()) {
                Text(
                    "Пары идут по обычной сетке",
                    style = MaterialTheme.typography.bodySmall,
                    color = cs.onSurfaceVariant,
                    modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp),
                )
            }
            upcoming.forEach { r -> ShiftRow(r) { save(shifts - r.dates) } }
            if (showPast) past.forEach { r -> ShiftRow(r, true) { save(shifts - r.dates) } }
            if (past.isNotEmpty()) {
                TextButton(
                    { showPast = !showPast },
                    Modifier.padding(start = 6.dp),
                ) {
                    Text(
                        if (showPast) "Скрыть прошедшие" else "Прошедшие · " + past.size,
                        fontSize = 13.sp,
                    )
                }
            }
            InfoDivider()
            val date = pending
            if (date == null) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp)) {
                    TextButton(
                        {
                            pickDate(ctx, "Выходные с какого дня", LocalDate.now()) { from ->
                                pickDate(ctx, "По какой день, с " + from.format(DATE_FMT), from) { to ->
                                    val r = ShiftRange(minOf(from, to), maxOf(from, to), 0)
                                    save(shifts + r.dates.associateWith { 0 })
                                }
                            }
                        },
                        Modifier.weight(1f),
                    ) { Text("Выходные") }
                    TextButton(
                        { pickDate(ctx, "Учебный день", LocalDate.now()) { pending = it } },
                        Modifier.weight(1f),
                    ) { Text("Учебный день") }
                }
            } else {
                Column(Modifier.padding(start = 18.dp, end = 12.dp, top = 8.dp, bottom = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            date.format(DATE_FMT) + " — пары за",
                            Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton({ pending = null }) { Text("Отмена") }
                    }
                    Segmented(
                        DAYS_SHORT.take(5), -1,
                        { save(shifts + (date to (it + 1))); pending = null },
                        Modifier.fillMaxWidth(),
                    )
                }
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
            SwitchRow("О следующей паре", "до конца текущей и за 20 минут до первой", nextUpOn) {
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
            InfoDivider()
            SwitchRow("Проверять обновления", "раз в неделю, при выходе новой версии предложит обновиться", autoUpdate) {
                autoUpdate = it
                prefs.autoUpdate = it
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
private fun ShiftRow(r: ShiftRange, faded: Boolean = false, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            r.label,
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = if (faded) MaterialTheme.colorScheme.onSurfaceVariant
            else MaterialTheme.colorScheme.onSurface,
        )
        IconButton(onRemove) { Icon(Icons.Default.Close, "Убрать", Modifier.size(18.dp)) }
    }
}

/**
 * Системный календарь - свой пикер не нужен. ponytail: заголовок диалога
 * подсказывает, какой конец диапазона выбираем; хватает для пары дат в семестр.
 */
private fun pickDate(ctx: Context, title: String, initial: LocalDate, onPick: (LocalDate) -> Unit) {
    DatePickerDialog(
        ctx, { _, y, m, d -> onPick(LocalDate.of(y, m + 1, d)) },
        initial.year, initial.monthValue - 1, initial.dayOfMonth,
    ).apply { setTitle(title) }.show()
}

@Composable
private fun SettingsBlock(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            // Строки блока появляются по галочкам - блок тянется, а не прыгает.
            .animateContentSize()
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

// ---------- Источник расписания ----------

/**
 * Онбординг и он же - смена источника из настроек: встроенное расписание или свой xlsx.
 * Выбранное сразу пишется в schedule.json, дальше приложение про источник не знает.
 */
@Composable
fun SourceScreen(onDone: () -> Unit, onBack: (() -> Unit)? = null) {
    val cs = MaterialTheme.colorScheme
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var klass by remember { mutableStateOf(Prefs(ctx).klass) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var parsed by remember { mutableStateOf<JSONObject?>(null) }   // файл прочитан, ждём номер недели
    // Даты начала семестра в выгрузке нет. У всех групп DNUI она общая - её и предлагаем.
    var week1 by remember { mutableStateOf(WEEK1_MONDAY) }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        error = null
        scope.launch {
            // файл может лежать на облачном диске - читаем не на главном потоке
            val r = runCatching {
                withContext(Dispatchers.IO) {
                    ctx.contentResolver.openInputStream(uri)!!.use { Xlsx.parse(it, WEEK1_MONDAY) }
                }
            }
            busy = false
            r.onFailure { error = (it as? ScheduleFormatError)?.message ?: "Не получилось открыть файл" }
            r.onSuccess { parsed = it }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(cs.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 24.dp)
    ) {
        if (onBack != null) {
            IconButton(onBack, Modifier.padding(top = 8.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Назад")
            }
        } else {
            Spacer(Modifier.height(40.dp))
        }
        Text("Откуда брать расписание", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(6.dp))
        Text(
            "Потом можно поменять в настройках. Заметки к парам остаются на телефоне.",
            style = MaterialTheme.typography.bodySmall,
            color = cs.onSurfaceVariant,
        )

        Spacer(Modifier.height(24.dp))
        SectionLabel("Встроенное")
        SettingsBlock {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(
                    "留软件25401 (俄财大) — уже в приложении, интернет не нужен",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Класс", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Segmented(listOf("1", "2"), klass - 1, { klass = it + 1 }, Modifier.width(130.dp))
                }
                Button(
                    { Schedule.useBundled(ctx, klass); onDone() },
                    Modifier.fillMaxWidth(),
                    enabled = !busy,
                ) { Text("Выбрать") }
            }
        }

        Spacer(Modifier.height(16.dp))
        SectionLabel("Свой файл")
        SettingsBlock {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                val json = parsed
                if (json == null) {
                    Text(
                        "Выгрузка расписания DNUI в xlsx: лист 课表, пары по строкам, дни по столбцам",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cs.error) }
                    // ponytail: "*/*", а не MIME xlsx - мессенджеры сохраняют файлы с каким попало типом,
                    // и нужный оказался бы неактивным. Не-xlsx парсер отобьёт понятной ошибкой.
                    OutlinedButton(
                        { pick.launch(arrayOf("*/*")) },
                        Modifier.fillMaxWidth(),
                        enabled = !busy,
                    ) { Text(if (busy) "Читаю файл…" else "Выбрать файл") }
                } else {
                    // Спрашиваем номер текущей недели, а не дату начала семестра:
                    // его студенты знают, а дату - нет. Дата выводится из номера.
                    val week = Schedule(week1, emptyList()).weekOf(LocalDate.now())
                    Text(
                        "Файл прочитан, пар в нём: " + json.getJSONArray("lessons").length(),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text("Какая сейчас учебная неделя?", style = MaterialTheme.typography.titleMedium)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton({ week1 = week1.plusWeeks(1) }) { Text("−", fontSize = 24.sp) }
                        Text(
                            if (week >= 1) "$week-я" else "ещё не начался",
                            Modifier.weight(1f),
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.titleLarge,
                        )
                        IconButton({ week1 = week1.minusWeeks(1) }) { Text("+", fontSize = 24.sp) }
                    }
                    Text(
                        (if (week >= 1) "Семестр начался " else "Семестр начнётся ") +
                            "в понедельник, " + week1.format(DATE_FMT),
                        Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall,
                        color = cs.onSurfaceVariant,
                    )
                    Button(
                        {
                            json.getJSONObject("meta").put("week1_monday", week1.toString())
                            Schedule.useFile(ctx, json)
                            onDone()
                        },
                        Modifier.fillMaxWidth(),
                    ) { Text("Готово") }
                    TextButton({ parsed = null; pick.launch(arrayOf("*/*")) }, Modifier.fillMaxWidth()) { Text("Другой файл") }
                }
            }
        }
    }
}
