package jp.co.ecoris.ecorismap

import VectorTileStyle.CssColor
import VectorTileStyle.EvalContext
import VectorTileStyle.StyleExpression
import com.google.gson.Gson
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import org.junit.Assert.fail
import org.junit.Test

/**
 * Android 側のスタイル式評価器（StyleExpression / CssColor）を、共通フィクスチャで検証する。
 * iOS の CLI ランナー（scripts/native-tests/ios/main.m）と同じ比較規則で、全ケースの失敗をまとめて報告する。
 *
 * 実行: cd android && ./gradlew :app:testDebugUnitTest --tests 'jp.co.ecoris.ecorismap.StyleExpressionFixtureTest'
 */
class StyleExpressionFixtureTest {
  private val fixtureRelPath = "src/__tests__/resources/vectorStyleExpressions.json"

  private fun locateFixture(): File {
    // Gradle の単体テストは android/app を作業ディレクトリにする。見つからなければ親を遡る
    var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
    while (dir != null) {
      val f = File(dir, fixtureRelPath)
      if (f.isFile) return f
      dir = dir.parentFile
    }
    throw IllegalStateException("fixture not found: $fixtureRelPath (from ${System.getProperty("user.dir")})")
  }

  private fun numbersClose(a: Double, b: Double): Boolean {
    if (a == b) return true
    val diff = abs(a - b)
    return diff <= 1e-9 || diff <= 1e-12 * max(abs(a), abs(b))
  }

  /** expected（フィクスチャの JSON 値）と actual（評価器の戻り値）を比較する。不一致なら理由を返す */
  private fun valuesMatch(expected: Any?, actual: Any?): String? {
    if (expected == null) {
      return if (actual == null) null else "expected null, got ${describe(actual)}"
    }
    if (expected is Map<*, *> && expected.containsKey("\$color")) {
      if (actual !is CssColor) return "expected color ${expected["\$color"]}, got ${describe(actual)}"
      val c = expected["\$color"] as List<*>
      val comps = doubleArrayOf(actual.r, actual.g, actual.b, actual.a)
      for (i in 0 until 4) {
        if (abs((c[i] as Number).toDouble() - comps[i]) > 1e-6) return "expected color $c, got $actual"
      }
      return null
    }
    if (expected is Boolean) {
      return if (actual is Boolean && expected == actual) null else "expected bool $expected, got ${describe(actual)}"
    }
    if (expected is Number) {
      if (actual !is Number || !numbersClose(expected.toDouble(), actual.toDouble())) {
        return "expected number $expected, got ${describe(actual)}"
      }
      return null
    }
    if (expected is String) {
      return if (actual is String && expected == actual) null else "expected string \"$expected\", got ${describe(actual)}"
    }
    if (expected is List<*>) {
      if (actual !is List<*> || expected.size != actual.size) return "expected array $expected, got ${describe(actual)}"
      for (i in expected.indices) {
        valuesMatch(expected[i], actual[i])?.let { return it }
      }
      return null
    }
    if (expected is Map<*, *>) {
      if (actual !is Map<*, *> || expected.size != actual.size) return "expected object $expected, got ${describe(actual)}"
      for ((key, value) in expected) {
        valuesMatch(value, actual[key])?.let { return it }
      }
      return null
    }
    return "unsupported expected type"
  }

  private fun describe(v: Any?): String = when {
    v == null -> "null"
    StyleExpression.isError(v) -> "<error>"
    v is String -> "\"$v\""
    else -> "$v (${v.javaClass.simpleName})"
  }

  @Test
  fun allFixtureCasesPass() {
    val file = locateFixture()
    @Suppress("UNCHECKED_CAST")
    val doc = Gson().fromJson(file.readText(), Map::class.java) as Map<String, Any?>
    @Suppress("UNCHECKED_CAST")
    val cases = doc["cases"] as List<Map<String, Any?>>
    val gson = Gson()
    var pass = 0
    val failures = ArrayList<String>()
    for (c in cases) {
      val id = c["id"] as String
      val kind = c["kind"] as String
      @Suppress("UNCHECKED_CAST")
      val properties = (c["properties"] as? Map<String, Any?>) ?: emptyMap()
      val ctx = EvalContext(properties, c["geometryType"] as? String, c["featureId"], (c["zoom"] as? Number)?.toDouble() ?: 0.0)
      val expectError = c["expectedError"] == true
      var why: String? = null
      when (kind) {
        "expression" -> {
          val actual = StyleExpression.evaluate(c["expression"], ctx)
          why = if (expectError) {
            if (StyleExpression.isError(actual)) null else "expected error, got ${describe(actual)}"
          } else if (StyleExpression.isError(actual)) {
            "expected ${c["expected"]}, got error"
          } else {
            valuesMatch(c["expected"], actual)
          }
        }
        "color" -> {
          val actual = CssColor.parse(c["expression"] as? String)
          why = if (expectError) {
            if (actual == null) null else "expected parse failure, got $actual"
          } else if (actual == null) {
            "expected ${c["expected"]}, got null"
          } else {
            valuesMatch(c["expected"], actual)
          }
        }
        "filter" -> {
          val normalized = StyleExpression.normalizeFilter(c["filter"])
          val actual = StyleExpression.evalFilter(normalized, ctx)
          val expected = if (expectError) false else c["expected"] == true
          if (actual != expected) why = "expected $expected, got $actual (normalized: ${gson.toJson(normalized)})"
        }
        else -> why = "unknown kind $kind"
      }
      if (why == null) {
        pass++
      } else {
        val input = c["expression"] ?: c["filter"]
        failures.add("FAIL $id ${gson.toJson(input)} props=${gson.toJson(properties)}: $why")
      }
    }
    println("${pass} passed, ${failures.size} failed (of ${cases.size})")
    if (failures.isNotEmpty()) {
      fail("${failures.size} of ${cases.size} fixture cases failed (${pass} passed):\n" + failures.joinToString("\n"))
    }
  }
}
