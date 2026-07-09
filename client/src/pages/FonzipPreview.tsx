import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

function JsonViewer({ data }: { data: any }) {
  if (!data) return null;
  if (data.error) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
        {data.error}
      </div>
    );
  }
  return (
    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function FonzipPreview() {
  const [fetchEnabled, setFetchEnabled] = useState(false);

  const { data: status } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/fonzip/status"],
    queryFn: () => fetch("/api/fonzip/status", { credentials: "include" }).then((r) => r.json()),
    staleTime: 0,
  });

  const {
    data: preview,
    isLoading,
    error,
    refetch,
  } = useQuery<{ members: any; dues: any; donations: any }>({
    queryKey: ["/api/fonzip/preview"],
    queryFn: () => fetch("/api/fonzip/preview", { credentials: "include" }).then((r) => r.json()),
    enabled: fetchEnabled,
    staleTime: 0,
    retry: false,
  });

  const handleFetch = () => {
    if (fetchEnabled) {
      refetch();
    } else {
      setFetchEnabled(true);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fonzip Entegrasyonu</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fonzip'ten gelen ham veriyi inceleyin
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <Badge variant={status.configured ? "default" : "destructive"} className="gap-1">
              {status.configured ? (
                <><CheckCircle2 className="h-3 w-3" /> Bağlı</>
              ) : (
                <><XCircle className="h-3 w-3" /> Yapılandırılmamış</>
              )}
            </Badge>
          )}
          <Button onClick={handleFetch} disabled={isLoading} size="sm">
            {isLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Yükleniyor...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-2" /> Fonzip'ten Çek</>
            )}
          </Button>
        </div>
      </div>

      {!status?.configured && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 text-sm text-destructive">
            <strong>Credentials eksik.</strong> Docker Compose'a şu env değişkenlerini ekleyin:
            <pre className="mt-2 bg-background rounded p-2 text-xs text-foreground">
{`FONZIP_CLIENT_ID: your_client_id
FONZIP_CLIENT_SECRET: your_client_secret`}
            </pre>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 text-sm text-destructive">
            {String(error)}
          </CardContent>
        </Card>
      )}

      {preview && (
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Üyeler</TabsTrigger>
            <TabsTrigger value="dues">Aidatlar</TabsTrigger>
            <TabsTrigger value="donations">Bağışlar / Ödemeler</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  /members — ilk 5 kayıt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={preview.members} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dues">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  /dues — ilk 5 kayıt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={preview.dues} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="donations">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  /donations — ilk 5 kayıt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <JsonViewer data={preview.donations} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!preview && !isLoading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <RefreshCw className="h-8 w-8 opacity-30" />
            <p className="text-sm">Veriyi görmek için "Fonzip'ten Çek" butonuna basın.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
