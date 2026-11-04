import json
import os

def handler(event, context):
    print(f"Received event: {event}")

    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
    }

    try:
        # Parse request body
        body_str = event.get("body")
        if not body_str:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Missing request body"}, ensure_ascii=False)
            }

        try:
            body = json.loads(body_str)
        except Exception as e:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": f"Invalid JSON in request body: {e}"}, ensure_ascii=False)
            }

        text = body.get("text", "").strip()
        if not text:
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps({"translated": ""}, ensure_ascii=False)
            }

        # Call LLM for translation
        translated = _translate_with_llm(text)

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"translated": translated}, ensure_ascii=False)
        }

    except Exception as e:
        print(f"[ERROR] Failed to translate text: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }


def _translate_with_llm(text: str) -> str:
    """
    Translate text to English using the configured LLM provider.
    Supports Bedrock and Ollama — reads provider from environment variables.
    """
    provider = os.environ.get("LLM_PROVIDER", "bedrock").lower()

    prompt = (
        f"Translate the following text to English. "
        f"Return ONLY the translated text. No explanation, no quotes, no extra text.\n\n"
        f"Text: {text}"
    )

    if provider == "bedrock":
        return _call_bedrock(prompt)
    elif provider == "ollama":
        return _call_ollama(prompt)
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")


def _call_bedrock(prompt: str) -> str:
    import boto3

    region = os.environ.get("AWS_REGION", "us-west-2")
    model_id = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")

    client = boto3.client("bedrock-runtime", region_name=region)
    body = {
        "messages": [
            {"role": "user", "content": [{"text": prompt}]}
        ],
        "inferenceConfig": {
            "temperature": 0,
            "maxTokens": 512
        }
    }
    response = client.invoke_model(
        modelId=model_id,
        body=json.dumps(body)
    )
    result = json.loads(response["body"].read())
    return result["output"]["message"]["content"][0]["text"].strip()


def _call_ollama(prompt: str) -> str:
    import httpx

    payload = {
        "model": os.environ.get("OLLAMA_MODEL", "llama3"),
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0, "num_predict": 512}
    }
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    resp = httpx.post(f"{base_url}/api/chat", json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()
