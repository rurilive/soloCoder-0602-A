import re
import ast
import operator
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

OUTPUT_VAR_PREFIX = "::DAG_VAR::"

_safe_operators = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
    ast.Not: operator.not_,
    ast.Invert: operator.invert,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.And: lambda a, b: a and b,
    ast.Or: lambda a, b: a or b,
}


def _safe_eval(node: ast.AST, variables: Dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body, variables)
    elif isinstance(node, ast.BinOp):
        left = _safe_eval(node.left, variables)
        right = _safe_eval(node.right, variables)
        op_type = type(node.op)
        if op_type in _safe_operators:
            return _safe_operators[op_type](left, right)
        raise ValueError(f"Unsupported binary operator: {op_type.__name__}")
    elif isinstance(node, ast.UnaryOp):
        operand = _safe_eval(node.operand, variables)
        op_type = type(node.op)
        if op_type in _safe_operators:
            return _safe_operators[op_type](operand)
        raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
    elif isinstance(node, ast.BoolOp):
        values = [_safe_eval(v, variables) for v in node.values]
        op_type = type(node.op)
        if op_type == ast.And:
            result = True
            for v in values:
                result = result and v
            return result
        elif op_type == ast.Or:
            result = False
            for v in values:
                result = result or v
            return result
        raise ValueError(f"Unsupported boolean operator: {op_type.__name__}")
    elif isinstance(node, ast.Compare):
        left = _safe_eval(node.left, variables)
        result = True
        for op, comparator in zip(node.ops, node.comparators):
            right = _safe_eval(comparator, variables)
            op_type = type(op)
            if op_type in _safe_operators:
                if not _safe_operators[op_type](left, right):
                    result = False
                    break
            else:
                raise ValueError(f"Unsupported comparator: {op_type.__name__}")
            left = right
        return result
    elif isinstance(node, ast.Name):
        if node.id in variables:
            return variables[node.id]
        raise ValueError(f"Unknown variable: {node.id}")
    elif isinstance(node, ast.Constant):
        return node.value
    elif isinstance(node, ast.Str):
        return node.s
    elif isinstance(node, ast.Num):
        return node.n
    elif isinstance(node, ast.NameConstant):
        return node.value
    elif isinstance(node, ast.Attribute):
        value = _safe_eval(node.value, variables)
        if isinstance(value, dict):
            if node.attr in value:
                return value[node.attr]
            raise ValueError(f"Key '{node.attr}' not found in dictionary")
        raise ValueError(f"Cannot access attribute '{node.attr}' on non-dict value")
    elif isinstance(node, ast.Subscript):
        value = _safe_eval(node.value, variables)
        if isinstance(node.slice, ast.Index):
            key = _safe_eval(node.slice.value, variables)
        else:
            key = _safe_eval(node.slice, variables)
        if isinstance(value, dict):
            if key in value:
                return value[key]
            raise ValueError(f"Key '{key}' not found in dictionary")
        elif isinstance(value, (list, tuple)):
            return value[key]
        raise ValueError(f"Cannot subscript value of type {type(value).__name__}")
    elif isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
            if func_name == "str":
                args = [_safe_eval(arg, variables) for arg in node.args]
                return str(args[0]) if args else ""
            elif func_name == "int":
                args = [_safe_eval(arg, variables) for arg in node.args]
                return int(args[0]) if args else 0
            elif func_name == "float":
                args = [_safe_eval(arg, variables) for arg in node.args]
                return float(args[0]) if args else 0.0
            elif func_name == "bool":
                args = [_safe_eval(arg, variables) for arg in node.args]
                return bool(args[0]) if args else False
            elif func_name == "len":
                args = [_safe_eval(arg, variables) for arg in node.args]
                return len(args[0]) if args else 0
        raise ValueError(f"Unsupported function call")
    else:
        raise ValueError(f"Unsupported expression type: {type(node).__name__}")


def evaluate_condition(expression: str, variables: Dict[str, Any]) -> bool:
    if not expression or not expression.strip():
        return True

    try:
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval(tree, variables)
        return bool(result)
    except Exception as e:
        logger.warning(f"Condition evaluation failed: {expression}, error: {e}")
        raise ValueError(f"条件表达式求值失败: {str(e)}")


def parse_output_vars(stdout: str) -> Dict[str, str]:
    variables = {}
    pattern = re.escape(OUTPUT_VAR_PREFIX) + r"(\w+)=([^\n]*)"
    matches = re.findall(pattern, stdout)

    for key, value in matches:
        variables[key.strip()] = value.strip()

    return variables


_VAR_PATTERN = re.compile(r"\{\{\s*([\w\.]+)\s*\}\}")


def inject_variables(script_content: str, variables: Dict[str, Any]) -> str:
    def replace_var(match):
        var_path = match.group(1)
        parts = var_path.split(".")
        current = variables

        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return match.group(0)

        return str(current)

    return _VAR_PATTERN.sub(replace_var, script_content)


def collect_variables_from_executions(
    node_executions: Dict[int, Any],
    node_data_map: Dict[int, Dict]
) -> Dict[str, Any]:
    variables = {}
    for node_id, ne in node_executions.items():
        if ne.status == "success" and ne.output_vars:
            node_info = node_data_map.get(node_id, {})
            node_name = node_info.get("name", f"node_{node_id}")
            safe_name = re.sub(r'[^\w]', '_', node_name)
            variables[safe_name] = ne.output_vars
            variables[f"node_{node_id}"] = ne.output_vars

    return variables


def find_variable_references(script_content: str) -> list:
    matches = _VAR_PATTERN.findall(script_content)
    return list(set(matches))
