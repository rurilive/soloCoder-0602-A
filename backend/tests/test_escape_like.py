import pytest
from app.utils import escape_like_pattern


def test_escape_like_percent():
    result = escape_like_pattern("100%")
    assert result == r"100\%"


def test_escape_like_underscore():
    result = escape_like_pattern("user_name")
    assert result == r"user\_name"


def test_escape_like_both():
    result = escape_like_pattern("test_%value_")
    assert result == r"test\_\%value\_"


def test_escape_like_no_special_chars():
    result = escape_like_pattern("normal search")
    assert result == "normal search"


def test_escape_like_empty_string():
    result = escape_like_pattern("")
    assert result == ""


def test_escape_like_multiple_percent():
    result = escape_like_pattern("%%%")
    assert result == r"\%\%\%"


def test_escape_like_backslash():
    result = escape_like_pattern("path\\to\\file")
    assert result == "path\\\\to\\\\file"


def test_escape_like_backslash_with_percent():
    result = escape_like_pattern("100\\%")
    assert result == r"100\\\%"


def test_escape_like_backslash_with_underscore():
    result = escape_like_pattern("user\\_name")
    assert result == r"user\\\_name"


def test_escape_like_backslash_only():
    result = escape_like_pattern("\\")
    assert result == "\\\\"


def test_escape_like_mixed_all():
    result = escape_like_pattern("test\\_%value_")
    assert result == "test\\\\\\_\\%value\\_"
