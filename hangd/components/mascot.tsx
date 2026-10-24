"use client";

import { useId, type CSSProperties } from "react";
import "./mascot.css";

export type MascotMood =
  | "idle"
  | "happy"
  | "panic"
  | "sabotage"
  | "win"
  | "lose";
export interface MascotProps {
  mood?: MascotMood;
  mistakes?: number;
  large?: boolean;
  compact?: boolean;
  className?: string;
}

/** Original, code-drawn mascot. The rope lowers a foam boxing glove, never a noose. */
export function Mascot({
  mood = "idle",
  mistakes = 0,
  large = false,
  compact = false,
  className = "",
}: MascotProps) {
  const id = useId().replaceAll(":", "");
  const danger = Math.min(8, Math.max(0, mistakes));
  const nervous = mood === "panic" || mood === "lose" || danger >= 5;
  const pleased = mood === "happy" || mood === "win";
  const tilt = mood === "lose" ? 9 : danger >= 6 ? 4 : 0;
  return (
    <div
      className={`hangd-mascot hangd-mascot--${mood}${large ? " hangd-mascot--large" : ""}${compact ? " hangd-mascot--compact" : ""} ${className}`}
    >
      <svg
        viewBox={compact ? "132 107 223 246" : "0 0 440 390"}
        role="img"
        aria-label={
          nervous
            ? "A nervous little green character on a wobbly springboard"
            : pleased
              ? "A little green character celebrating"
              : "A curious little green character beside an absurd hangman machine"
        }
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id={`${id}-hatch`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(28)"
          >
            <path d="M0 0V6" stroke="#25251f" strokeWidth="1" opacity=".15" />
          </pattern>
          <clipPath id={`${id}-body`}>
            <path d="M190 176C185 138 214 122 248 124C284 126 302 150 305 185L313 255C316 292 293 315 256 318C219 322 187 305 186 270L190 176Z" />
          </clipPath>
        </defs>

        {!compact && (
          <g
            className="mascot-rig"
            stroke="#25251f"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <ellipse
              cx="223"
              cy="355"
              rx="168"
              ry="11"
              fill="#25251f"
              opacity=".055"
              stroke="none"
            />
            <path d="M48 351H395" stroke="#DAD8CD" />
            <path d="M78 344V56Q78 49 85 49H296V65H94V344Z" fill="#EAE6D9" />
            <path d="M78 79V67H94V80" fill="#D2CFBF" stroke="none" />
            <path d="M94 107L137 65H156L94 126Z" fill="#D9D5C5" />
            <path d="M77 340H96L111 350H61Z" fill="#EAE6D9" />
            <circle cx="86" cy="58" r="2.2" fill="#25251f" stroke="none" />
            <circle cx="147" cy="57" r="2.2" fill="#25251f" stroke="none" />
            <circle cx="281" cy="57" r="2.2" fill="#25251f" stroke="none" />
            <path d="M84 158V316" stroke="#C4C0B0" strokeWidth="1" />
            <rect
              x="62"
              y="188"
              width="48"
              height="65"
              rx="11"
              fill="#8A86ED"
            />
            <path d="M68 245H103" stroke="#6A65CB" />
            <circle
              cx="86"
              cy="203"
              r="6"
              fill={danger > 3 ? "#EF8055" : "#D5F55B"}
            />
            <circle cx="86" cy="227" r="10" fill="#F7F5EF" />
            <path
              className="mascot-crank"
              d="M86 227L70 219L61 226"
              strokeWidth="5"
            />
            <circle cx="60" cy="227" r="5" fill="#25251F" />
            <path
              d="M110 240H136Q149 240 149 258V320Q149 330 167 330H188"
              stroke="#BEB9A9"
              strokeDasharray="3 5"
            />

            <g
              className="mascot-glove"
              style={
                {
                  "--rope-drop": `${Math.min(danger, 6) * 3}px`,
                } as CSSProperties
              }
            >
              <circle cx="279" cy="77" r="12" fill="#E9E5D9" />
              <circle cx="279" cy="77" r="4" fill="#F7F5EF" />
              <path
                d="M290 77V100Q290 108 282 108"
                stroke="#958967"
                strokeWidth="3"
              />
              <path d="M282 103V113" />
              <path d="M263 110H294V125H263Z" fill="#F3B394" />
              <path
                d="M263 123C255 123 250 130 250 138C250 149 258 154 270 154H291C304 154 311 144 306 134C309 125 304 120 298 120C292 110 280 109 273 117C268 115 263 118 263 123Z"
                fill="#EF8055"
              />
              <path d="M273 120C268 123 267 129 270 135H288" />
              <path d="M291 146H274" stroke="#BA5530" strokeWidth="1.5" />
              <path
                d="M256 132L262 128M256 140L263 136"
                stroke="#FFCEB8"
                strokeWidth="1.5"
              />
            </g>
            {danger > 1 && (
              <path
                className="mascot-warning"
                d="M326 99L330 88M338 108L350 104M320 86L321 79"
                stroke="#EF8055"
                strokeWidth="3"
              />
            )}
            {danger > 3 && (
              <g
                className="mascot-machine-steam"
                stroke="#9B95A5"
                strokeWidth="2"
              >
                <path d="M55 187C44 181 54 176 44 169" />
                <path d="M119 202C133 195 120 189 132 183" />
              </g>
            )}
            <path
              d="M208 329L214 323L229 333L246 323L263 333L279 323L288 329"
              stroke="#8A86ED"
              strokeWidth="4"
            />
            <rect
              x="193"
              y="335"
              width="104"
              height="10"
              rx="4"
              fill="#D9D5C5"
            />
            <g transform={`rotate(${tilt} 245 326)`}>
              <rect
                x="162"
                y="316"
                width="165"
                height="11"
                rx="5.5"
                fill="#8A86ED"
              />
              <path d="M170 321H317" stroke="#B4AFF9" strokeWidth="1.5" />
              <path d="M173 327L173 331M314 327L314 331" />
            </g>
            <path
              d="M353 342L355 329L361 334L365 322L370 342Z"
              fill="#D5F55B"
              strokeWidth="1.8"
            />
            <path
              d="M123 349L128 344M132 350L133 347"
              stroke="#B8B6A9"
              strokeWidth="1.5"
            />
            <path
              d="M191 70L195 72M205 88L209 86"
              stroke="#CFCBBC"
              strokeWidth="1.5"
            />
          </g>
        )}

        <g
          className="mascot-character"
          stroke="#25251f"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g className="mascot-foot mascot-foot--left">
            <path d="M216 294L210 311" strokeWidth="6" />
            <path
              d="M210 306C196 305 187 308 190 315H220C224 310 218 307 210 306Z"
              fill="#25251f"
            />
          </g>
          <g className="mascot-foot mascot-foot--right">
            <path d="M282 295L288 310" strokeWidth="6" />
            <path
              d="M287 306C301 304 312 309 309 315H279C276 310 280 307 287 306Z"
              fill="#25251f"
            />
          </g>
          <g className="mascot-arm mascot-arm--left">
            <path d="M193 232C179 237 176 252 170 252" strokeWidth="5" />
            <path
              d="M174 248C171 241 166 242 166 248C160 242 156 246 160 251C152 249 151 256 160 258C166 266 175 262 178 257"
              fill="#D5F55B"
            />
          </g>
          <g className="mascot-arm mascot-arm--right">
            <path d="M301 229C315 234 321 247 327 242" strokeWidth="5" />
            <path
              d="M323 242C321 234 327 231 330 238C331 228 337 230 336 238C343 232 347 237 340 242C349 244 345 250 339 248C335 255 324 252 323 246"
              fill="#D5F55B"
            />
          </g>
          <path
            d="M190 176C185 138 214 122 248 124C284 126 302 150 305 185L313 255C316 292 293 315 256 318C219 322 187 305 186 270L190 176Z"
            fill="#D5F55B"
          />
          <g clipPath={`url(#${id}-body)`} stroke="none">
            <path
              d="M301 135C284 166 297 217 298 267C298 299 268 309 226 311L241 330L322 319L335 167Z"
              fill="#BAD93F"
            />
            <path
              d="M194 249C191 279 197 294 213 298C199 280 203 261 199 243Z"
              fill="#ECFFA2"
            />
            <path
              d="M195 146C200 140 204 139 207 142C210 147 202 152 201 160L194 174Z"
              fill="#F2FFBD"
            />
            <path
              d="M282 281L291 297L312 283L305 269Z"
              fill={`url(#${id}-hatch)`}
            />
          </g>
          <path
            d="M237 123C230 112 235 104 241 113L244 121C243 106 253 104 252 116L251 123C258 114 264 119 255 126"
            fill="#D5F55B"
          />
          <path
            d="M228 282L229 285M264 287L265 289"
            stroke="#AECF31"
            strokeWidth="2"
          />
          <path
            d="M209 242L216 243M282 242L288 239"
            stroke="#A9C831"
            strokeWidth="4"
          />
          <g className="mascot-face">
            <g className="mascot-eyes">
              <ellipse
                cx="224"
                cy="194"
                rx="24"
                ry={pleased ? 26 : 28}
                fill="#FFFEF8"
              />
              <ellipse
                cx="273"
                cy="191"
                rx="23"
                ry={pleased ? 26 : 28}
                fill="#FFFEF8"
              />
              {pleased ? (
                <g strokeWidth="4">
                  <path d="M215 193Q222 181 231 192" />
                  <path d="M263 190Q270 178 279 190" />
                </g>
              ) : (
                <g className="mascot-pupils" stroke="none">
                  <ellipse
                    cx={nervous ? 229 : 225}
                    cy={nervous ? 186 : 195}
                    rx="7.5"
                    ry="10"
                    fill="#25251f"
                  />
                  <ellipse
                    cx={nervous ? 278 : 274}
                    cy={nervous ? 183 : 192}
                    rx="7.5"
                    ry="10"
                    fill="#25251f"
                  />
                  <circle
                    cx={nervous ? 231 : 227}
                    cy={nervous ? 183 : 192}
                    r="2.4"
                    fill="#FFF"
                  />
                  <circle
                    cx={nervous ? 280 : 276}
                    cy={nervous ? 180 : 189}
                    r="2.4"
                    fill="#FFF"
                  />
                </g>
              )}
            </g>
            {nervous ? (
              <g className="mascot-brows" strokeWidth="3">
                <path d="M208 163L231 168" />
                <path d="M260 165L280 157" />
              </g>
            ) : (
              <g className="mascot-brows">
                <path d="M210 158Q218 153 226 156" />
                <path d="M263 154Q272 150 281 155" />
              </g>
            )}
            {mood === "lose" ? (
              <path d="M237 240L262 238" strokeWidth="3.5" />
            ) : pleased ? (
              <g>
                <path
                  d="M234 234Q250 257 269 230Q256 232 234 234Z"
                  fill="#25251f"
                />
                <path
                  d="M245 244Q253 239 263 241"
                  stroke="#EF8055"
                  strokeWidth="5"
                />
              </g>
            ) : nervous ? (
              <path
                d="M243 239Q250 228 261 238L259 249Q250 253 244 246Z"
                fill="#25251f"
              />
            ) : (
              <path d="M242 237Q250 241 257 234" strokeWidth="3" />
            )}
            <ellipse
              cx="207"
              cy="231"
              rx="8"
              ry="4"
              fill="#EF8055"
              opacity=".65"
              stroke="none"
            />
            <ellipse
              cx="291"
              cy="226"
              rx="7"
              ry="4"
              fill="#EF8055"
              opacity=".65"
              stroke="none"
            />
          </g>
          {(nervous || mood === "sabotage") && (
            <g className="mascot-sweat" strokeWidth="1.8">
              <path
                d="M316 168C316 168 304 182 306 188C308 197 320 196 320 187C320 180 316 168 316 168Z"
                fill="#A4CBE5"
              />
              <path
                d="M177 188C177 188 170 199 172 203C175 208 182 205 181 200C180 196 177 188 177 188Z"
                fill="#A4CBE5"
              />
            </g>
          )}
        </g>
        {pleased && (
          <g
            className="mascot-sparkles"
            stroke="#25251f"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M151 157V169M145 163H157" />
            <path d="M333 189V203M326 196H340" />
            <path
              d="M194 103L198 111M191 110L200 105"
              stroke="#8A86ED"
              strokeWidth="3"
            />
            <path
              d="M351 276L356 284M350 283L357 277"
              stroke="#EF8055"
              strokeWidth="3"
            />
          </g>
        )}
        {mood === "sabotage" && (
          <g className="mascot-chaos-shapes" strokeWidth="2.5" stroke="#8A86ED">
            <path d="M157 155L170 145L167 163Z" />
            <circle cx="342" cy="177" r="6" />
            <path d="M144 279L156 290M144 290L156 279" stroke="#EF8055" />
            <path d="M350 254L355 244L361 252L367 242" />
          </g>
        )}
        {!compact && (
          <g opacity=".45" stroke="#B7B2A2" strokeLinecap="round">
            <path d="M20 287L23 284M393 137L397 139M366 60L369 57M40 103L43 106M401 302L404 299" />
            <circle cx="141" cy="295" r="1.5" fill="#B7B2A2" />
            <circle cx="368" cy="218" r="1.5" fill="#B7B2A2" />
          </g>
        )}
      </svg>
    </div>
  );
}
