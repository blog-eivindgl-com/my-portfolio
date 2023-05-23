"use client"
import TransactionsSummaryViewModel from "@/app/viewmodel/transactions/TransactionsSummaryViewModel"
import { Container, Grid, Row, Text, CSS, Col, Card } from "@nextui-org/react"
import { FC } from "react"
import SummaryItem from "./SummaryItem"

type Props = {
    vm: TransactionsSummaryViewModel
}

const Summary: FC<Props> = ({vm}: Props) => {
    function createPriceLabel(date: number | undefined): string {
        if (date === undefined) {
            return "Price";
        }

        const d = new Date(date);
        return `Price ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    }
    return (
        <Container>
            <Grid.Container gap={2}>
                <Row>
                    <SummaryItem title="Realized win/loss" value={vm.totalRealizedWin} showAsRedOrGreen />
                    <SummaryItem title="Unrealized win/loss" value={vm.currentUnrealizedWin || 0} showAsRedOrGreen />
                    <SummaryItem title="Investment" value={vm.currentInvestment} />
                    <SummaryItem title="Shares" value={vm.currentSharesLeft} />
                    <SummaryItem title={createPriceLabel(vm.currentPriceUpdated)} value={vm.currentPrice} />
                </Row>
            </Grid.Container>
        </Container>
        );
}

export default Summary;