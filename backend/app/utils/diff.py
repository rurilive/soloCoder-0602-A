from dataclasses import dataclass


@dataclass
class DiffOp:
    type: str
    value: str


def _compute_lcs_table(a: list[str], b: list[str]) -> list[list[int]]:
    n = len(a)
    m = len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    
    return dp


def _backtrack_lcs(dp: list[list[int]], a: list[str], b: list[str]) -> list[DiffOp]:
    i = len(a)
    j = len(b)
    ops: list[DiffOp] = []
    
    while i > 0 and j > 0:
        if a[i - 1] == b[j - 1]:
            ops.append(DiffOp(type="equal", value=a[i - 1]))
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            ops.append(DiffOp(type="delete", value=a[i - 1]))
            i -= 1
        else:
            ops.append(DiffOp(type="insert", value=b[j - 1]))
            j -= 1
    
    while i > 0:
        ops.append(DiffOp(type="delete", value=a[i - 1]))
        i -= 1
    
    while j > 0:
        ops.append(DiffOp(type="insert", value=b[j - 1]))
        j -= 1
    
    ops.reverse()
    return ops


def _tokenize_chars(text: str) -> list[str]:
    return list(text or "")


def _tokenize_words(text: str) -> list[str]:
    if not text:
        return []
    tokens = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace():
            j = i
            while j < n and text[j].isspace():
                j += 1
            tokens.append(text[i:j])
            i = j
        elif ch.isalnum() or (ord(ch) > 127):
            j = i
            while j < n and (text[j].isalnum() or ord(text[j]) > 127):
                j += 1
            tokens.append(text[i:j])
            i = j
        else:
            tokens.append(ch)
            i += 1
    return tokens


def compute_diff(old_text: str, new_text: str, word_level: bool = True) -> list[DiffOp]:
    if word_level:
        old_tokens = _tokenize_words(old_text)
        new_tokens = _tokenize_words(new_text)
    else:
        old_tokens = _tokenize_chars(old_text)
        new_tokens = _tokenize_chars(new_text)

    dp = _compute_lcs_table(old_tokens, new_tokens)
    ops = _backtrack_lcs(dp, old_tokens, new_tokens)

    merged: list[DiffOp] = []
    for op in ops:
        if merged and merged[-1].type == op.type:
            merged[-1] = DiffOp(type=op.type, value=merged[-1].value + op.value)
        else:
            merged.append(op)

    return merged
