import re
import unicodedata

SENSITIVE_WORDS = [
    "暴力", "色情", "赌博", "毒品", "枪支", "炸弹",
    "诈骗", "洗钱", "传销", "非法", "违禁",
    "暴恐", "分裂", "颠覆", "极端", "邪教",
    "毒品交易", "毒品买卖", "吸毒", "贩毒",
    "卖淫", "嫖娼", "情色", "黄色",
    "赌博网站", "网络赌博", "线上赌博",
    "枪支买卖", "枪支交易", "军火",
    "炸弹袭击", "恐怖袭击", "自杀式袭击",
    "诈骗集团", "电信诈骗", "网络诈骗",
    "传销组织", "非法集资", "庞氏骗局",
]

SENSITIVE_WORDS.sort(key=len, reverse=True)

VARIANT_MAP = {
    "暴": ["爆", "暴", "虣", "暴"],
    "力": ["力", "刕", "叻", "嘞", "カ", "ガ", "か", "が"],
    "色": ["色", "铯", "涩", "瑟"],
    "情": ["情", "晴", "氰", "箐"],
    "赌": ["赌", "睹", "堵", "嘟"],
    "博": ["博", "搏", "薄", "泊"],
    "毒": ["毒", "独", "渎", "牍"],
    "品": ["品", "榀", "牝", "聘"],
    "枪": ["枪", "炝", "呛", "跄"],
    "支": ["支", "枝", "知", "之"],
    "炸": ["炸", "诈", "榨", "乍"],
    "弹": ["弹", "蛋", "惮", "掸"],
    "诈": ["诈", "炸", "榨", "乍"],
    "骗": ["骗", "偏", "篇", "翩"],
    "洗": ["洗", "喜", "嘻", "锡"],
    "钱": ["钱", "前", "乾", "潜"],
    "传": ["传", "转", "赚", "专"],
    "销": ["销", "消", "宵", "萧"],
    "非": ["非", "飞", "妃", "菲"],
    "法": ["法", "砝", "珐", "灋"],
    "违": ["违", "围", "为", "唯"],
    "禁": ["禁", "近", "进", "尽"],
    "恐": ["恐", "孔", "控", "空"],
    "分": ["分", "份", "纷", "芬"],
    "裂": ["裂", "烈", "列", "猎"],
    "颠": ["颠", "巅", "掂", "滇"],
    "覆": ["覆", "复", "副", "富"],
    "极": ["极", "级", "急", "即"],
    "端": ["端", "短", "段", "断"],
    "邪": ["邪", "斜", "鞋", "写"],
    "教": ["教", "交", "郊", "胶"],
    "交": ["交", "教", "郊", "胶"],
    "易": ["易", "意", "艺", "益"],
    "网": ["网", "往", "望", "忘"],
    "络": ["络", "洛", "落", "骆"],
    "电": ["电", "店", "点", "典"],
    "信": ["信", "新", "心", "欣"],
    "黄": ["黄", "皇", "荒", "慌"],
    "卖": ["卖", "买", "麦", "埋"],
    "淫": ["淫", "银", "吟", "寅"],
    "娼": ["娼", "昌", "猖", "菖"],
    "嫖": ["嫖", "飘", "漂", "票"],
    "吸": ["吸", "西", "希", "息"],
    "贩": ["贩", "饭", "反", "犯"],
    "军": ["军", "均", "君", "俊"],
    "火": ["火", "伙", "或", "活"],
    "恐": ["恐", "孔", "控", "空"],
    "怖": ["怖", "部", "步", "布"],
    "袭": ["袭", "席", "习", "息"],
    "击": ["击", "机", "鸡", "基"],
    "自": ["自", "字", "子", "紫"],
    "杀": ["杀", "沙", "傻", "啥"],
    "式": ["式", "是", "事", "市"],
    "集": ["集", "级", "急", "及"],
    "团": ["团", "推", "退", "腿"],
    "非": ["非", "飞", "妃", "菲"],
    "法": ["法", "砝", "珐", "灋"],
    "集": ["集", "级", "急", "及"],
    "资": ["资", "子", "字", "紫"],
    "庞": ["庞", "旁", "胖", "彷"],
    "氏": ["氏", "是", "事", "市"],
    "骗": ["骗", "偏", "篇", "翩"],
    "局": ["局", "举", "句", "巨"],
}

SEPARATOR_CHARS = r"[\s\*_\-\.~\|\u00a0\u2000-\u200f\u2028-\u202f\u3000]|[\\\/\^\$\(\)\[\]\{\}\+\=\?\!\,\;\:\'\"`~#@%\&\<\>]"

NORMALIZE_MAP = str.maketrans({
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
    "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10",
    "⓪": "0",
    "Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4", "Ⅴ": "5",
    "Ⅵ": "6", "Ⅶ": "7", "Ⅷ": "8", "Ⅸ": "9", "Ⅹ": "10",
    "ⅰ": "1", "ⅱ": "2", "ⅲ": "3", "ⅳ": "4", "ⅴ": "5",
    "ⅵ": "6", "ⅶ": "7", "ⅷ": "8", "ⅸ": "9", "ⅹ": "10",
    "零": "0", "一": "1", "二": "2", "三": "3", "四": "4",
    "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
    "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
    "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
    "ａ": "a", "ｂ": "b", "ｃ": "c", "ｄ": "d", "ｅ": "e",
    "ｆ": "f", "ｇ": "g", "ｈ": "h", "ｉ": "i", "ｊ": "j",
    "ｋ": "k", "ｌ": "l", "ｍ": "m", "ｎ": "n", "ｏ": "o",
    "ｐ": "p", "ｑ": "q", "ｒ": "r", "ｓ": "s", "ｔ": "t",
    "ｕ": "u", "ｖ": "v", "ｗ": "w", "ｘ": "x", "ｙ": "y",
    "ｚ": "z",
    "Ａ": "A", "Ｂ": "B", "Ｃ": "C", "Ｄ": "D", "Ｅ": "E",
    "Ｆ": "F", "Ｇ": "G", "Ｈ": "H", "Ｉ": "I", "Ｊ": "J",
    "Ｋ": "K", "Ｌ": "L", "Ｍ": "M", "Ｎ": "N", "Ｏ": "O",
    "Ｐ": "P", "Ｑ": "Q", "Ｒ": "R", "Ｓ": "S", "Ｔ": "T",
    "Ｕ": "U", "Ｖ": "V", "Ｗ": "W", "Ｘ": "X", "Ｙ": "Y",
    "Ｚ": "Z",
})


def _preprocess(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(NORMALIZE_MAP)
    return text


def _generate_variants(word: str) -> list[str]:
    variants = [word]
    for char in word:
        if char in VARIANT_MAP:
            new_variants = []
            for v in variants:
                for alt in VARIANT_MAP[char]:
                    new_variants.append(v.replace(char, alt, 1))
            variants.extend(new_variants)
    return list(set(variants))


def _build_pattern(variants: list[str]) -> re.Pattern:
    sep = f"({SEPARATOR_CHARS})*"
    pattern_parts = []
    for v in variants:
        chars = list(v)
        char_patterns = []
        for c in chars:
            char_patterns.append(re.escape(c))
        pattern = f"({sep.join(char_patterns)})"
        pattern_parts.append(pattern)
    combined = "|".join(pattern_parts)
    return re.compile(combined, re.IGNORECASE | re.UNICODE)


_compiled_patterns: dict[str, re.Pattern] = {}


def _get_or_build_pattern(word: str) -> re.Pattern:
    if word not in _compiled_patterns:
        variants = _generate_variants(word)
        _compiled_patterns[word] = _build_pattern(variants)
    return _compiled_patterns[word]


def _count_chars(match: str) -> int:
    sep_re = re.compile(SEPARATOR_CHARS, re.UNICODE)
    return len(sep_re.sub("", match))


def filter_sensitive_words(text: str) -> str:
    if not text:
        return text
    processed = _preprocess(text)
    result = processed

    for word in SENSITIVE_WORDS:
        pattern = _get_or_build_pattern(word)

        def _replace(match):
            matched = match.group(0)
            char_count = _count_chars(matched)
            return "*" * char_count

        result = pattern.sub(_replace, result)

    return result


def contains_sensitive_words(text: str) -> bool:
    if not text:
        return False
    processed = _preprocess(text)
    for word in SENSITIVE_WORDS:
        pattern = _get_or_build_pattern(word)
        if pattern.search(processed):
            return True
    return False
