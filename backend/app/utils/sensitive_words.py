import re

SENSITIVE_WORDS = [
    "暴力", "色情", "赌博", "毒品", "枪支", "炸弹",
    "诈骗", "洗钱", "传销", "非法", "违禁",
]


def filter_sensitive_words(text: str) -> str:
    if not text:
        return text
    result = text
    for word in SENSITIVE_WORDS:
        pattern = re.compile(re.escape(word), re.IGNORECASE)
        result = pattern.sub("*" * len(word), result)
    return result


def contains_sensitive_words(text: str) -> bool:
    if not text:
        return False
    for word in SENSITIVE_WORDS:
        if re.search(re.escape(word), text, re.IGNORECASE):
            return True
    return False
