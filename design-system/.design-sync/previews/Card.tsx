import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from "@gtm-ide/design-system";

export function Basic() {
  return (
    <div style={{ width: 320 }}>
      <Card>
        <CardHeader>
          <CardTitle>GitHub signal channel</CardTitle>
          <CardDescription>
            Watches ICP repos for dependency adds and first GTM-engineer hires.
          </CardDescription>
        </CardHeader>
        <CardContent>
          A composed outreach system: source → enrich → founder gate → send.
        </CardContent>
      </Card>
    </div>
  );
}

export function WithControls() {
  return (
    <div style={{ width: 320 }}>
      <Card>
        <CardHeader>
          <CardTitle>Activate self-serve signups</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Badge tone="gap" caps>
              Attribution gap
            </Badge>
            <Button size="sm">Open program</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
