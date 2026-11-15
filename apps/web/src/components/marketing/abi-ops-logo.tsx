import Image from 'next/image'

import ui from './abi-ops-ui.module.css'

export function AbiLogo() {
  return (
    <span className={ui.logoFrame}>
      <Image alt="" fill sizes="52px" src="/images/abi-mark.png" />
    </span>
  )
}
