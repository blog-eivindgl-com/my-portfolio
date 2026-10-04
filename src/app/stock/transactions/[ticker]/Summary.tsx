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
    if (vm.orderWarning) return <Container><p role="alert">{vm.orderWarning}</p></Container>;
    return (
        <Container>
            {vm.incompleteReason && <p role="status">{vm.incompleteReason}</p>}
            {vm.currentPrice !== undefined && <p>
                {vm.currentPriceSource === 'quote' ? 'Recorded quote' : vm.currentPriceSource === 'transaction' ? 'Transaction-price estimate (not a market quote)' : 'Price with unspecified source'}
                {' · '}{vm.currentPriceAgeDays} days old. No freshness threshold has been configured.
            </p>}
            {vm.currentPrice === undefined && (vm.currentSharesLeft || 0) > 0 && <p role="status">No eligible price is available. Market value and unrealized gain are unknown.</p>}
            <Grid.Container gap={2}>
                <Row>
                    <SummaryItem title="Realized win" value={vm.totalRealizedWin} showAsRedOrGreen />
                    <SummaryItem title="Unrealized win" value={vm.currentSharesLeft === 0 ? 0 : vm.currentUnrealizedWin} showAsRedOrGreen />
                    <SummaryItem title="Investment" value={vm.currentInvestment} />
                    <SummaryItem title="Shares" value={vm.currentSharesLeft} />
                    <SummaryItem title={createPriceLabel(vm.currentPriceUpdated)} value={vm.currentPrice} />
                </Row>
            </Grid.Container>
        </Container>
        );
}

export default Summary;
