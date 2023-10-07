import { ReactNode } from "react"

export type PageType = {
    routerPath: string,
    title: ReactNode,
    menuitem?: {
        label: ReactNode,
        icon: ReactNode
    },
    component: (props: {}) => JSX.Element
}