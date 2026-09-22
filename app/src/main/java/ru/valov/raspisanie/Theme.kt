package ru.valov.raspisanie

import android.app.Activity
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import kotlinx.coroutines.delay

// Токены из макета «Расписание пар - Android», артборд «Токены и компоненты».
// ponytail: шрифты макета (Onest / Unbounded) не подключены - системный sans,
// размеры и начертания взяты из макета. Нужны сами шрифты - положить в res/font.

private val LightColors = lightColorScheme(
    primary = Color(0xFF5A3DC4),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE5DCFF),
    onPrimaryContainer = Color(0xFF22005F),
    secondaryContainer = Color(0xFFE5DCFF),
    onSecondaryContainer = Color(0xFF22005F),
    tertiaryContainer = Color(0xFFFFDCC0),
    onTertiaryContainer = Color(0xFF5C3000),
    background = Color(0xFFFBF8FD),
    onBackground = Color(0xFF1B1723),
    surface = Color(0xFFFBF8FD),
    onSurface = Color(0xFF1B1723),
    surfaceVariant = Color(0xFFF4EFF7),
    onSurfaceVariant = Color(0xFF5F5869),
    surfaceContainer = Color(0xFFF4EFF7),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerHighest = Color(0xFFEDE7F2),
    outline = Color(0xFF7A7289),
    outlineVariant = Color(0xFFE6DFEC),
    error = Color(0xFFB3261E),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFCFBCFF),
    onPrimary = Color(0xFF341A9C),
    primaryContainer = Color(0xFF4B2FB0),
    onPrimaryContainer = Color(0xFFE8DEFF),
    secondaryContainer = Color(0xFF4B2FB0),
    onSecondaryContainer = Color(0xFFE8DEFF),
    tertiaryContainer = Color(0xFF432A14),
    onTertiaryContainer = Color(0xFFFFD3B0),
    background = Color(0xFF131019),
    onBackground = Color(0xFFE9E1F3),
    surface = Color(0xFF131019),
    onSurface = Color(0xFFE9E1F3),
    surfaceVariant = Color(0xFF1A1622),
    onSurfaceVariant = Color(0xFFA9A0B8),
    surfaceContainer = Color(0xFF1A1622),
    surfaceContainerLowest = Color(0xFF1A1622),
    surfaceContainerHighest = Color(0xFF241F2F),
    outline = Color(0xFF8E86A0),
    outlineVariant = Color(0xFF2B2537),
    error = Color(0xFFFFB4AB),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(14.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

private val AppTypography = Typography().let { d ->
    d.copy(
        headlineMedium = d.headlineMedium.copy(
            fontSize = 30.sp, lineHeight = 34.sp,
            fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp,
        ),
        titleLarge = d.titleLarge.copy(
            fontSize = 21.sp, lineHeight = 25.sp,
            fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp,
        ),
        titleMedium = d.titleMedium.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = d.bodyLarge.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
        bodyMedium = d.bodyMedium.copy(fontSize = 14.5.sp, fontWeight = FontWeight.Medium),
        bodySmall = d.bodySmall.copy(fontSize = 12.5.sp),
        labelSmall = d.labelSmall.copy(
            fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.1.sp,
        ),
    )
}

/** Выбранная тема: её же спрашивает subjectColors, системной она может и не быть. */
private val LocalDark = staticCompositionLocalOf { false }

/** @param theme 0 - системная, 1 - светлая, 2 - тёмная (Prefs.theme). */
@Composable
fun AppTheme(theme: Int = 0, content: @Composable () -> Unit) {
    val dark = when (theme) {
        1 -> false
        2 -> true
        else -> isSystemInDarkTheme()
    }
    val colors = if (dark) DarkColors else LightColors
    val view = LocalView.current
    // Статус-бар красит XML-тема по -night, а выбор в настройках её перебивает.
    SideEffect {
        val window = (view.context as Activity).window
        window.statusBarColor = colors.background.toArgb()
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !dark
    }
    MaterialTheme(
        colorScheme = colors,
        typography = AppTypography,
        shapes = AppShapes,
    ) {
        // Экран пары открывается мимо Scaffold, а LocalContentColor по умолчанию чёрный:
        // без этого Text и Icon без явного color на тёмной теме сливались с фоном.
        CompositionLocalProvider(
            LocalDark provides dark,
            LocalContentColor provides colors.onSurface,
            content = content,
        )
    }
}

// Пастельная заливка + тёмный текст той же гаммы (контраст выше 7:1),
// на тёмной теме - наоборот. Порядок повторяет легенду макета.
private val SubjectLight = listOf(
    Color(0xFFE5DCFF) to Color(0xFF22005F),
    Color(0xFFD7E6FF) to Color(0xFF00305E),
    Color(0xFFCFEBDC) to Color(0xFF06452A),
    Color(0xFFFFDCC0) to Color(0xFF5C3000),
    Color(0xFFFBD9E6) to Color(0xFF5C0031),
    Color(0xFFCDE9E7) to Color(0xFF00363A),
    Color(0xFFF2E4B8) to Color(0xFF443100),
    Color(0xFFE2DFF0) to Color(0xFF2B2A4A),
    Color(0xFFFFD9D6) to Color(0xFF5C1512),
)

private val SubjectDark = listOf(
    Color(0xFF30264F) to Color(0xFFD8CBFF),
    Color(0xFF1B2C49) to Color(0xFFC3DAFF),
    Color(0xFF16382A) to Color(0xFFB7E6CC),
    Color(0xFF432A14) to Color(0xFFFFD3B0),
    Color(0xFF43202F) to Color(0xFFF8C9DD),
    Color(0xFF15343A) to Color(0xFFB5E4E4),
    Color(0xFF3A3016) to Color(0xFFEADFB0),
    Color(0xFF2A2838) to Color(0xFFD5D2E8),
    Color(0xFF45241F) to Color(0xFFFFC9C3),
)

/** Цвет предмета: индекс - место названия в Schedule.subjects. */
@Composable
fun subjectColors(index: Int): Pair<Color, Color> {
    val palette = if (LocalDark.current) SubjectDark else SubjectLight
    return palette[Math.floorMod(index, palette.size)]
}

@Composable
fun Chip(text: String, bg: Color, fg: Color, modifier: Modifier = Modifier) {
    Text(
        text, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

/** Полоса хода пары: своя, чтобы держать цвета и скругления макета. */
@Composable
fun ProgressBar(fraction: Float, track: Color, fill: Color) {
    // Часы тикают раз в полминуты: без этого полоса прыгала бы рывками.
    val width by animateFloatAsState(fraction.coerceIn(0f, 1f), tween(700), label = "progress")
    Box(
        Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(track)
    ) {
        Box(
            Modifier
                .fillMaxWidth(width)
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(fill)
        )
    }
}

/**
 * Плитка въезжает снизу с задержкой по месту в списке - список собирается на глазах.
 * [animate] = false показывает сразу: страницы листалки собираются прямо под пальцем,
 * и въезд на них выглядел бы подгрузкой.
 * ponytail: задержка привязана к индексу; списки тут короткие, а уехавший за экран
 * и вернувшийся элемент переиграет появление заново - ключи и состояние ради этого не заводим.
 */
@Composable
fun Modifier.appearIn(index: Int, animate: Boolean = true): Modifier {
    val shown = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (!animate) return@LaunchedEffect
        delay(index * 45L)
        shown.animateTo(1f, tween(260))
    }
    return graphicsLayer {
        alpha = shown.value
        translationY = (1f - shown.value) * 18.dp.toPx()
    }
}

/**
 * Метка идущей пары дышит - видно, что время живое.
 * ponytail: пока она на экране, кадры идут непрерывно, поэтому вешаем только на «сейчас».
 */
@Composable
fun Modifier.pulsing(): Modifier {
    val pulse = rememberInfiniteTransition("pulse")
    val fade by pulse.animateFloat(
        0.55f, 1f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "alpha",
    )
    return graphicsLayer { alpha = fade }
}

@Composable
fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
    )
}

/** Переключатель-пилюля из макета: две-три кнопки в общей плашке. */
@Composable
fun Segmented(
    options: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .clip(RoundedCornerShape(22.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .padding(4.dp)
    ) {
        options.forEachIndexed { i, option ->
            SegmentedItem(option, i == selected) { onSelect(i) }
        }
    }
}

@Composable
private fun RowScope.SegmentedItem(text: String, on: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(
        if (on) MaterialTheme.colorScheme.primary else Color.Transparent,
        tween(180), label = "segment",
    )
    val fg by animateColorAsState(
        if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
        tween(180), label = "segmentText",
    )
    Box(
        Modifier
            .weight(1f)
            .height(36.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(bg)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = fg,
            fontSize = 13.5.sp,
            fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
        )
    }
}
