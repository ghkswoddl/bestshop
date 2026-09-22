"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TextField } from "@/components/ui";
import { signContractAction } from "@/lib/contract-actions";

/**
 * Canvas 서명 패드 (모의 전자서명 — 계획 §1).
 *
 * 그린 획을 PNG data URL 로 만들어 hidden input 에 싣고 서버 액션으로 보낸다.
 * 마우스와 터치를 모두 받도록 Pointer Events 를 쓴다.
 */
export function SignaturePad({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 표시 크기와 실제 픽셀을 분리해 고해상도 화면에서도 선이 또렷하게 남는다.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    // Canvas 2D API 는 CSS 클래스가 아닌 색상 문자열만 받는다 — gray.900 토큰(#1A1A1A)과 동일한
    // 값을 리터럴로 쓴 것뿐이라 Tailwind 토큰 규칙 위반이 아니다.
    context.strokeStyle = "#1A1A1A";
  }, []);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = positionOf(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const extendStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
    if (!hasDrawing) setHasDrawing(true);
  };

  const endStroke = () => {
    const canvas = canvasRef.current;
    if (canvas && hasDrawing) setDataUrl(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    setDataUrl("");
  };

  return (
    <form action={signContractAction} className="flex flex-col gap-lg">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signatureImage" value={dataUrl} />

      <TextField
        name="signerName"
        label="서명자 성함"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="계약자 본인 성함"
      />

      <div>
        <p className="mb-xs text-caption font-medium text-gray-700">
          아래 칸에 서명해 주세요 (마우스 또는 손가락으로 그립니다)
        </p>
        <canvas
          ref={canvasRef}
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          className="h-48 w-full touch-none rounded-control border-2 border-dashed border-gray-400 bg-white"
        />
        <div className="mt-sm flex flex-wrap items-center justify-between gap-md">
          <p className="text-caption text-gray-700">
            {hasDrawing ? "서명이 입력되었습니다." : "아직 서명이 입력되지 않았습니다."}
          </p>
          <Button variant="secondary" onClick={clear}>
            다시 쓰기
          </Button>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={!hasDrawing || name.trim().length === 0}>
        위 내용에 동의하고 서명 제출
      </Button>
    </form>
  );
}
