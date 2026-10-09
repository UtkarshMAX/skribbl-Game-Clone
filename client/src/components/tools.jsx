import socket from '../socket/socket';
import { Card, IconButton } from '../ui';

// Same color values as before (they are sent to the server as the stroke color).
const COLORS = ["black", "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "white"];

const Tools = ({ color, setColor, brushSize, setBrushSize, tool, setTool, roomCode }) => {

     const clearCanvas = () => {
          socket.emit("canvas_clear", { roomCode });
     }
     const undoCanvas = () => {
          socket.emit("draw_undo", { roomCode });
     }

     return (
          <Card className='flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-3 p-3'>

               {/* --------------colors-------------- */}
               <div className='grid grid-cols-5 gap-1.5' role="group" aria-label="Colors">
                    {COLORS.map((c) => (
                         <button key={c} type="button" onClick={() => setColor(c)}
                              aria-label={c} aria-pressed={color === c} title={c}
                              style={{ backgroundColor: c }}
                              className={`size-8 rounded-[10px] cursor-pointer ring-1 ring-inset ring-black/10 transition-all duration-150
                                   hover:-translate-y-0.5 active:scale-90
                                   ${color === c ? 'scale-105 shadow-[0_0_0_2px_white,0_0_0_4px_var(--color-ink)]' : ''}`} />
                    ))}
               </div>

               {/* --------------brush-size-------------- */}
               <label className='flex items-center gap-3'>
                    <span className='sr-only'>Brush size</span>
                    <span aria-hidden="true" className='grid size-8 place-items-center'>
                         <span className='rounded-full bg-ink transition-all duration-150'
                              style={{ width: `${Math.max(4, brushSize * 1.4)}px`, height: `${Math.max(4, brushSize * 1.4)}px` }} />
                    </span>
                    <input type="range" min='1' max='20' value={brushSize}
                         onChange={(event) => setBrushSize(Number(event.target.value))}
                         className='w-28 sm:w-36 accent-blue-600 cursor-grab active:cursor-grabbing' />
               </label>

               {/* --------------tool + actions-------------- */}
               <div className='flex items-center gap-1'>
                    <IconButton label="Brush" icon="brush" active={tool === "brush"} onClick={() => setTool("brush")} />
                    <IconButton label="Eraser" icon="ink_eraser" active={tool === "eraser"} onClick={() => setTool("eraser")} />
                    <span className='mx-1 h-7 w-px bg-slate-200' aria-hidden="true" />
                    <IconButton label="Undo" icon="undo" onClick={undoCanvas} />
                    <IconButton label="Clear canvas" icon="delete" onClick={clearCanvas} />
               </div>

          </Card>
     )
}

export default Tools;
