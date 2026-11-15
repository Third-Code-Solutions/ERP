'use client'

import type { CSSProperties } from 'react'

import { StrokeStage, artClasses, strokeClass } from './abi-ops-art'
import { HOUSE_FILL, HOUSE_VIEWBOX, houseElements } from './abi-ops-house-art'

type CssVars = CSSProperties & Record<`--${string}`, string | number>

/**
 * The house elevation, built up stage by stage. Each element appears at its
 * own stage and stays; stepping back erases what the earlier stage did not have.
 */
export function StageHouse({
  stage,
  lastStage,
  label,
  shouldBuild,
  className,
}: {
  stage: number
  lastStage: number
  label: string
  shouldBuild: boolean
  className?: string
}) {
  return (
    <StrokeStage
      className={className}
      isComplete={stage >= lastStage}
      label={label}
      mode="stage"
      shouldBuild={shouldBuild}
      viewBox={HOUSE_VIEWBOX}
    >
      {(hatchId) => (
        <>
          <path className={artClasses.fill} d={HOUSE_FILL} />
          <path
            className={artClasses.hatchFill}
            d={HOUSE_FILL}
            fill={`url(#${hatchId})`}
          />
          {houseElements.map((element, index) => {
            if (element[0] === 's') {
              const [, code, d, firstStage, delay, duration] = element
              return (
                <path
                  className={strokeClass(code)}
                  d={d}
                  data-off={firstStage > stage}
                  key={index}
                  pathLength={1}
                  style={{ '--sd': `${delay}ms`, '--dur': `${duration}ms` } as CssVars}
                />
              )
            }
            const [, x, y, anchor, text, firstStage, delay] = element
            return (
              <text
                className={artClasses.label}
                data-off={firstStage > stage}
                key={index}
                style={{ '--sd': `${delay}ms` } as CssVars}
                textAnchor={anchor as 'start' | 'middle' | 'end'}
                x={x}
                y={y}
              >
                {text}
              </text>
            )
          })}
        </>
      )}
    </StrokeStage>
  )
}
