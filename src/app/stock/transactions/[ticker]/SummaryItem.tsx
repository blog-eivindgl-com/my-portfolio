"use client"

import { Card, Text, CSS } from "@nextui-org/react";
import { FC } from "react";

type Props = {
    title: string,
    value: number | string | undefined,
    showAsRedOrGreen?: boolean
}

const SummaryItem: FC<Props> = ({title, value, showAsRedOrGreen}: Props) => {
    function getCssForValue(value: number | string | undefined): CSS | undefined {
        if (value === undefined) {
            return undefined;
        }

        const css: CSS = {};
        css.fontSize = '$7xl';
        css.textAlign = 'center';
        css.color = '$neutralLightContrast';

        if (typeof value === "number" && showAsRedOrGreen) {
            if (value && value > 0) {
                css.color = '$successLightContrast';
            } else if (value && value < 0) {
                css.color = '$errorLightContrast';
            }
        }

        return css;
    }

    function getCardCss(value: number | string | undefined): CSS | undefined {
        const css: CSS = {};
        css.margin = '$10';

        if (showAsRedOrGreen && value && typeof value === "number") {
            if (value > 0) {
                css.bg = '$successLight';
            } else if (value < 0) {
                css.bg = '$errorLight';
            }
        }

        return css;
    }

    return (
        <Card css={getCardCss(value)}>
            <Card.Body>
                <Text css={getCssForValue(value)}>{value}</Text>
            </Card.Body>
            <Card.Footer>
                <Text b css={{textAlign: 'center', color: '$neutralLightContrast'}}>{title}</Text>
            </Card.Footer>
        </Card>
    );
}

export default SummaryItem;