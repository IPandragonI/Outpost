"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { getEngineService } from "@/features/engine/browser-engine";
import { formatScore, type Score } from "@/features/engine/evaluation";
import {
  checkTrainingMove,
  isOwnTurn,
  opponentReply,
  preparedMoves,
} from "@/features/openings/repertoire";
import { uciLineToSan, uciOf, START_FEN } from "@/lib/chess/position";
import type { BoardMove } from "@/components/board/ChessBoard";
import { useRepertoires } from "./RepertoirePanel";
import { useT } from "@/lib/i18n/useT";

type Feedback =
  | { kind: "idle" }
  | { kind: "correct"; san: string }
  | {
      kind: "deviation";
      san: string;
      expected: string[];
      scores?: { played: Score; expected: Score };
    }
  | { kind: "complete" };

interface BoardState {
  fen: string;
  lastMove: string | null;
  orientation: "white" | "black";
  onMove: (move: BoardMove) => void;
}

/**
 * Plays a repertoire against the user: the trainer chooses among the prepared replies,
 * the user must find the repertoire's move. A different move is reported as a deviation
 * from the repertoire, with Stockfish's opinion of both moves: playable is not the same
 * as prepared.
 */
export function TrainerPanel({ onBoard }: { onBoard(board: BoardState | null): void }) {
  const { list } = useRepertoires();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fen, setFen] = useState(START_FEN);
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const t = useT();
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const repertoire = list?.find((r) => r.id === selectedId) ?? list?.[0] ?? null;
  const color = repertoire?.color ?? "w";

  // Plays the opponent's prepared reply, or ends the line when there is none.
  const reply = (position: string) => {
    if (!repertoire) return;
    const uci = opponentReply(repertoire.tree, position);
    if (!uci) {
      setFeedback({ kind: "complete" });
      return;
    }
    replyTimer.current = setTimeout(() => {
      const chess = new Chess(position);
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      const next = chess.fen();
      setFen(next);
      setLastMove(uci);
      if (!preparedMoves(repertoire.tree, next).length) setFeedback({ kind: "complete" });
    }, 450);
  };

  const start = () => {
    if (!repertoire) return;
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setFen(START_FEN);
    setLastMove(null);
    setFeedback({ kind: "idle" });
    setRunning(true);
    if (!isOwnTurn(repertoire.color, START_FEN)) reply(START_FEN);
  };

  const onMove = (move: BoardMove) => {
    if (!repertoire || !running || feedback.kind === "complete") return;
    if (!isOwnTurn(repertoire.color, fen)) return;
    const chess = new Chess(fen);
    let played;
    try {
      played = chess.move(move);
    } catch {
      return;
    }
    const uci = uciOf(played);
    const verdict = checkTrainingMove(repertoire.tree, fen, uci);
    if (verdict.kind === "unprepared") {
      setFeedback({ kind: "complete" });
      return;
    }
    setScore((s) => ({
      right: s.right + (verdict.kind === "repertoire" ? 1 : 0),
      total: s.total + 1,
    }));
    if (verdict.kind === "repertoire") {
      const next = chess.fen();
      setFen(next);
      setLastMove(uci);
      setFeedback({ kind: "correct", san: played.san });
      reply(next);
      return;
    }
    // Deviation: stay on the position, and ask Stockfish about both moves.
    const deviation: Feedback = { kind: "deviation", san: played.san, expected: verdict.expected };
    setFeedback(deviation);
    const service = getEngineService();
    const first = verdict.expected[0]!;
    const playedFen = chess.fen();
    const expectedChess = new Chess(fen);
    expectedChess.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] });
    Promise.all([
      service.analyze(playedFen, { depth: 14, multiPv: 1 }).promise,
      service.analyze(expectedChess.fen(), { depth: 14, multiPv: 1 }).promise,
    ]).then(
      ([a, b]) =>
        setFeedback((f) =>
          f.kind === "deviation" && f.san === played.san
            ? { ...f, scores: { played: a.score, expected: b.score } }
            : f,
        ),
      () => undefined,
    );
  };

  // The board lives in the parent: give it a stable move handler that always calls the
  // latest `onMove`, and publish the position only when it changes.
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  });
  const stableOnMove = useCallback((move: BoardMove) => onMoveRef.current(move), []);
  const hasRepertoire = Boolean(repertoire);
  useEffect(() => {
    onBoard(
      hasRepertoire
        ? { fen, lastMove, orientation: color === "w" ? "white" : "black", onMove: stableOnMove }
        : null,
    );
  }, [onBoard, hasRepertoire, fen, lastMove, color, stableOnMove]);
  useEffect(() => () => onBoard(null), [onBoard]);
  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

  if (list && list.length === 0) {
    return <p className="text-sm text-base-content/65">{t("trainer.noRepertoire")}</p>;
  }

  const expectedSan =
    feedback.kind === "deviation" ? uciLineToSan(fen, feedback.expected.slice(0, 1)) : [];

  return (
    <section className="flex flex-col gap-3" aria-label={t("trainer.label")}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="train-repertoire">
          {t("trainer.select")}
        </label>
        <select
          id="train-repertoire"
          className="select flex-1 select-sm"
          value={repertoire?.id ?? ""}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setRunning(false);
          }}
        >
          {list?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.color === "w" ? t("side.white") : t("side.black")})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={start}
          disabled={!repertoire}
        >
          {running ? t("trainer.restart") : t("trainer.start")}
        </button>
      </div>

      <p className="tabular text-sm text-base-content/70" aria-live="polite">
        {score.total > 0
          ? t("trainer.score", { right: score.right, total: score.total })
          : t("trainer.goal")}
      </p>

      <div aria-live="polite" className="min-h-16">
        {!running && <p className="text-sm text-base-content/60">{t("trainer.pressStart")}</p>}
        {running && feedback.kind === "idle" && (
          <p className="text-sm">
            {isOwnTurn(color, fen) ? t("trainer.yourMove") : t("trainer.replying")}
          </p>
        )}
        {feedback.kind === "correct" && (
          <p className="text-sm text-cls-best">✓ {t("trainer.correct", { san: feedback.san })}</p>
        )}
        {feedback.kind === "deviation" && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-cls-inaccuracy">
              {t(feedback.expected.length > 1 ? "trainer.deviationMany" : "trainer.deviation", {
                san: feedback.san,
                expected: expectedSan.join(", "),
              })}
            </p>
            <p className="text-xs text-base-content/65">
              {feedback.scores
                ? t("trainer.compare", {
                    san: feedback.san,
                    played: formatScore(feedback.scores.played),
                    expected: expectedSan[0] ?? "",
                    expectedScore: formatScore(feedback.scores.expected),
                  })
                : t("trainer.asking")}
            </p>
            <p className="text-xs text-base-content/65">{t("trainer.tryAgain")}</p>
          </div>
        )}
        {feedback.kind === "complete" && (
          <div className="flex items-center gap-2">
            <p className="text-sm">{t("trainer.complete")}</p>
            <button type="button" className="btn btn-soft btn-sm" onClick={start}>
              {t("trainer.nextLine")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
