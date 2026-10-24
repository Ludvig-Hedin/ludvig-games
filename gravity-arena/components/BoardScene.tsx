'use client';

import { useEffect, useRef } from 'react';
import { createBoardScene, type SceneOptions, type BoardSceneHandle } from '@/lib/board-scene';

export type BoardSceneProps = SceneOptions & { resetKey?: number; rotateKey?: number };

export default function BoardScene(props: BoardSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<BoardSceneHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!host.current) return;
    try {
      handle.current = createBoardScene(host.current, () => latest.current);
    } catch (error) {
      latest.current.onError?.(error instanceof Error ? error.message : 'WebGL could not start on this device.');
    }
    return () => { handle.current?.dispose(); handle.current = null; };
  }, [props.game.variant, props.theme, props.demo]);
  useEffect(() => { handle.current?.setGame(props.game); }, [props.game]);
  useEffect(() => { handle.current?.setSelection(props.selectedStack); }, [props.selectedStack, props.interactive, props.reducedMotion]);
  useEffect(() => { if (props.resetKey) handle.current?.reset(); }, [props.resetKey]);
  useEffect(() => { if (props.rotateKey) handle.current?.rotate(); }, [props.rotateKey]);
  useEffect(() => { handle.current?.setView(props.view || 'perspective'); }, [props.view]);
  return <div ref={host} className="board-scene" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }} />;
}
