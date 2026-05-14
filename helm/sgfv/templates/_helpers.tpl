{{/*
Génère le nom complet d'un service
*/}}
{{- define "sgfv.fullname" -}}
{{- printf "flotte-%s" .service }}
{{- end }}

{{/*
Labels communs
*/}}
{{- define "sgfv.labels" -}}
app.kubernetes.io/name: {{ .service }}
app.kubernetes.io/part-of: sgfv
app.kubernetes.io/managed-by: Helm
{{- end }}
