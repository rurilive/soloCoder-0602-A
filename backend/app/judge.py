import docker
import tempfile
import os
import uuid
import json
from typing import List, Dict, Any

client = docker.from_env()

PYTHON_IMAGE = "python:3.11-slim"

def run_python_code(code: str, test_cases: List[Dict[str, Any]], time_limit: int = 5, memory_limit: int = 256) -> Dict[str, Any]:
    results = []
    all_passed = True
    total_score = 0
    
    for i, test_case in enumerate(test_cases):
        input_data = test_case.get("input", "")
        expected_output = str(test_case.get("output", "")).strip()
        case_score = test_case.get("score", 0)
        
        result = execute_code_in_docker(code, input_data, time_limit, memory_limit)
        
        passed = False
        if result["status"] == "success" and result["output"].strip() == expected_output:
            passed = True
            total_score += case_score
        else:
            all_passed = False
        
        results.append({
            "case_index": i,
            "input": input_data,
            "expected_output": expected_output,
            "actual_output": result["output"],
            "error": result.get("error"),
            "status": result["status"],
            "passed": passed,
            "score": case_score if passed else 0
        })
    
    return {
        "all_passed": all_passed,
        "total_score": total_score,
        "results": results
    }

def execute_code_in_docker(code: str, input_data: str, time_limit: int, memory_limit: int) -> Dict[str, Any]:
    temp_dir = tempfile.mkdtemp()
    code_file = os.path.join(temp_dir, "solution.py")
    input_file = os.path.join(temp_dir, "input.txt")
    
    try:
        with open(code_file, "w", encoding="utf-8") as f:
            f.write(code)
        
        with open(input_file, "w", encoding="utf-8") as f:
            f.write(input_data)
        
        container = client.containers.run(
            PYTHON_IMAGE,
            command=f"bash -c 'timeout {time_limit} python /app/solution.py < /app/input.txt'",
            volumes={
                temp_dir: {"bind": "/app", "mode": "ro"}
            },
            working_dir="/app",
            mem_limit=f"{memory_limit}m",
            network_mode="none",
            read_only=True,
            user="nobody",
            detach=True
        )
        
        try:
            container.wait(timeout=time_limit + 2)
            logs = container.logs(stdout=True, stderr=True)
            output = logs.decode("utf-8", errors="replace")
            
            exit_code = container.attrs["State"]["ExitCode"]
            
            if exit_code == 124:
                return {"status": "timeout", "output": "", "error": "Time Limit Exceeded"}
            elif exit_code != 0:
                return {"status": "error", "output": "", "error": output}
            else:
                return {"status": "success", "output": output, "error": None}
                
        except Exception as e:
            return {"status": "error", "output": "", "error": str(e)}
        finally:
            try:
                container.remove(force=True)
            except:
                pass
                
    except Exception as e:
        return {"status": "error", "output": "", "error": str(e)}
    finally:
        try:
            os.remove(code_file)
            os.remove(input_file)
            os.rmdir(temp_dir)
        except:
            pass
