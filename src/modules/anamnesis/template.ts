// The anamnesis questionnaire model. Pure data, safe for client components.
// Question and section ids are stored with the answers and must stay stable
// forever: never rename or reuse one, only add new ids.

export type Option = { value: string; label: string };

export type Question = { id: string; label: string; help?: string } & (
  | { type: "text" | "long" }
  | { type: "single" | "multi"; options: Option[] }
);

export type Section = {
  id: string;
  title: string;
  help?: string;
  // Whether the answers are copied into a new anamnesis.
  copy: boolean;
  questions: Question[];
};

export type AnamnesisTemplate = {
  id: string;
  title: string;
  sections: Section[];
};

export const CURRENT_TEMPLATE_ID = "integrativa-ads-v1";

const long = (id: string, label: string, help?: string): Question => ({
  id,
  label,
  ...(help ? { help } : {}),
  type: "long",
});

const text = (id: string, label: string, help?: string): Question => ({
  id,
  label,
  ...(help ? { help } : {}),
  type: "text",
});

const choice = (
  type: "single" | "multi",
  id: string,
  label: string,
  options: Option[],
  help?: string,
): Question => ({ id, label, ...(help ? { help } : {}), type, options });

const integrativa: AnamnesisTemplate = {
  id: CURRENT_TEMPLATE_ID,
  title: "Anamnese Integrativa",
  sections: [
    {
      id: "identificacao",
      title: "Identificação do paciente",
      copy: true,
      questions: [
        text("identificacao_profissao", "Profissão"),
        choice("single", "identificacao_atuacao", "Atuação", [
          { value: "clt", label: "CLT" },
          { value: "independente", label: "Independente" },
          { value: "clinica", label: "Clínica" },
        ]),
        text("identificacao_endereco", "Endereço"),
        text("identificacao_convenio", "Convênio"),
      ],
    },
    {
      id: "queixas",
      title: "Queixas e sintomas",
      copy: true,
      questions: [
        long("queixas_principais", "Principais queixas"),
        long("queixas_duracao", "Duração dos sintomas"),
        long("queixas_agrava_melhora", "O que agrava ou melhora?"),
        long(
          "queixas_diagnostico_previo",
          "Já recebeu diagnóstico prévio? Qual?",
        ),
        long("queixas_tratamento_previo", "Já realizou algum tratamento?"),
        long("queixas_expectativa", "O que espera desse atendimento?"),
      ],
    },
    {
      id: "analise",
      title: "Fase de análise",
      copy: true,
      questions: [
        long("analise_sensacao", "Qual é a sensação predominante?"),
        long("analise_impacto_vida", "Como isso afeta sua vida?"),
        long("analise_emocoes", "Quais emoções estão associadas ao sintoma?"),
        long("analise_projeto_vida", "Qual é seu projeto de vida?"),
        long("analise_dez_anos", "Como se vê daqui a 10 anos?"),
        long("analise_metas", "Quais são suas metas de vida?"),
      ],
    },
    {
      id: "historia",
      title: "História de vida",
      copy: true,
      questions: [
        long("historia_pessoal", "Conte sua história pessoal:"),
        long(
          "historia_momentos_marcantes",
          "Quais foram os momentos mais marcantes da sua vida?",
        ),
        long(
          "historia_eventos_traumaticos",
          "Eventos traumáticos ou estressores importantes?",
        ),
      ],
    },
    {
      id: "antecedentes",
      title: "Antecedentes pessoais e familiares",
      copy: true,
      questions: [
        long("antecedentes_familiares", "Histórico de doenças familiares:"),
        long(
          "antecedentes_pessoais",
          "Doenças pessoais, cirurgias ou acidentes:",
        ),
        long("antecedentes_cronico", "Algum problema crônico de saúde?"),
      ],
    },
    {
      id: "gestacional",
      title: "Histórico gestacional",
      copy: true,
      questions: [
        long("gestacional_concepcao", "Concepção: Foi programado ou surpresa?"),
        long("gestacional_aceitacao", "Aceitação pelos pais?"),
        long(
          "gestacional_materno",
          "Histórico materno: Uso de anticoncepcionais, infecções urinárias, fertilização assistida?",
        ),
        long(
          "gestacional_emocional_pais",
          "Estado emocional dos pais na gestação?",
        ),
        long("gestacional_abortos", "Abortos anteriores?"),
        choice("multi", "gestacional_parto_tipo", "Tipo de parto", [
          { value: "normal", label: "Normal" },
          { value: "cesarea", label: "Cesárea" },
          { value: "forceps", label: "Fórceps" },
          { value: "trauma", label: "Trauma no parto" },
        ]),
        long("gestacional_complicacoes", "Complicações no parto?"),
        long("gestacional_uti", "Precisou de oxigenação ou UTI neonatal?"),
        long(
          "gestacional_primeiro_dia",
          "Reação após o primeiro dia de vida?",
        ),
        text("gestacional_amamentacao", "Tempo de amamentação?"),
        text("gestacional_alta_dias", "Alta hospitalar em quantos dias?"),
      ],
    },
    {
      id: "setenios",
      title: "Setênios da vida",
      help: "Analisar a evolução da personalidade e eventos traumáticos em cada fase. Por que essa análise é importante? Relaciona traumas aos setênios da vida. Auxilia no diagnóstico biopsicossomático. Identifica padrões de repetição emocional e impacto na saúde.",
      copy: true,
      questions: [
        long(
          "setenios_0_7",
          "0 a 7 anos",
          "Primeiras experiências e vínculo familiar.",
        ),
        long(
          "setenios_7_14",
          "7 a 14 anos",
          "Escolarização, relacionamentos e mudanças emocionais.",
        ),
        long(
          "setenios_14_21",
          "14 a 21 anos",
          "Descobertas, crises de identidade, início da vida adulta.",
        ),
        long(
          "setenios_21_28",
          "21 a 28 anos",
          "Independência, carreira e estruturação pessoal.",
        ),
        long(
          "setenios_28_35",
          "28 a 35 anos",
          "Conquistas, desafios profissionais e familiares.",
        ),
        long(
          "setenios_35_42",
          "35 a 42 anos",
          "Maturidade e mudanças significativas.",
        ),
        long(
          "setenios_42_49",
          "42 a 49 anos",
          "Revisão de propósitos e transição de vida.",
        ),
        long("setenios_49_mais", "49 anos ou mais"),
      ],
    },
    {
      id: "desencadeadores",
      title: "Impactos desencadeadores",
      copy: true,
      questions: [
        long(
          "desencadeadores_medos",
          "Medos: Doenças, escassez, insegurança financeira?",
        ),
        long("desencadeadores_preocupacoes", "O que te preocupa?"),
        long("desencadeadores_estresse", "O que te estressa?"),
        long(
          "desencadeadores_satisfacao",
          "Você está satisfeito com sua vida?",
        ),
        long("desencadeadores_realizacao", "Você se sente realizado?"),
        long("desencadeadores_felicidade", "Você se considera feliz?"),
      ],
    },
    {
      id: "clinicos",
      title: "Impactos clínicos",
      copy: true,
      questions: [
        long("clinicos_infancia", "Infância: Problemas de saúde na infância?"),
        long(
          "clinicos_adolescencia",
          "Adolescência: Algum trauma, perda ou acidente?",
        ),
        long("clinicos_intestino", "Intestino: Como funciona?"),
        choice(
          "single",
          "clinicos_bristol",
          "Qual tipo de fezes (Tabela de Bristol)?",
          ["1", "2", "3", "4", "5", "6", "7"].map((n) => ({
            value: n,
            label: `Tipo ${n}`,
          })),
        ),
        long("clinicos_pele", "Pele, cabelos e unhas"),
        long("clinicos_olhos_lingua", "Olhos e língua"),
        long("clinicos_flacidez_celulite", "Flacidez ou celulite?"),
        text("clinicos_circunferencia", "Circunferência abdominal"),
      ],
    },
    {
      id: "pregressas",
      title: "Histórico de doenças pregressas",
      copy: true,
      questions: [
        choice("multi", "pregressas_doencas", "Doenças pregressas", [
          { value: "diabetes", label: "Diabetes" },
          { value: "hipertensao", label: "Hipertensão" },
          { value: "cancer", label: "Câncer" },
          { value: "obesidade", label: "Obesidade" },
          { value: "enxaqueca", label: "Enxaqueca" },
          { value: "articulares", label: "Problemas articulares" },
          { value: "dores_cronicas", label: "Dores crônicas" },
        ]),
        long("pregressas_outras", "Outras"),
      ],
    },
    {
      id: "habitos",
      title: "Hábitos de vida",
      copy: true,
      questions: [
        long("habitos_sono_dorme_bem", "Sono: Dorme bem?"),
        long(
          "habitos_sono_insonia",
          "Sono: Tem insônia ou desperta precocemente?",
        ),
        long("habitos_sono_acorda", "Sono: Acorda bem-humorado ou cansado?"),
        long(
          "habitos_mente_ansiedade",
          "Mente e emoções: Sofre de ansiedade, irritabilidade ou impaciência?",
        ),
        long(
          "habitos_mente_padroes",
          "Mente e emoções: Tem padrões mentais sistemáticos ou calculistas?",
        ),
        long(
          "habitos_mente_memoria",
          "Mente e emoções: Como avalia sua memória e cognição?",
        ),
        long(
          "habitos_relacionamentos_vida",
          "Relacionamentos: Como é sua vida afetiva e social?",
        ),
        long(
          "habitos_relacionamentos_estresse",
          "Relacionamentos: O que te estressa?",
        ),
        long(
          "habitos_alimentacao",
          "Alimentação: Relate o que come nas principais refeições.",
        ),
      ],
    },
    {
      id: "lazer",
      title: "Hábitos de vida e lazer",
      copy: true,
      questions: [
        long("lazer_atividade_fisica", "Prática de atividades físicas?"),
        long("lazer_hobbies", "Tem hobbies?"),
        long("lazer_rotina", "Como é sua rotina de lazer?"),
      ],
    },
    {
      id: "diagnostico",
      title: "Diagnóstico biopsicossomático",
      help: "Preenchido pela profissional. Não é copiado para uma nova anamnese.",
      copy: false,
      questions: [
        long(
          "diagnostico_estado_geral",
          "Estado Geral",
          "Físico, mental, energético e intestinal.",
        ),
        long(
          "diagnostico_hormonal",
          "Hormonal",
          "Possíveis desequilíbrios detectados.",
        ),
        long("diagnostico_sono", "Sono", "Qualidade e impactos."),
        long(
          "diagnostico_fisiologico",
          "Fisiológico",
          "Avaliação de exames laboratoriais.",
        ),
        long(
          "diagnostico_exames_especiais",
          "Bioressonância, AO Scan e Mineralograma/Oligoscan",
        ),
      ],
    },
    {
      id: "protocolos",
      title: "Protocolos de tratamento",
      help: "Preenchido pela profissional. Não é copiado para uma nova anamnese.",
      copy: false,
      questions: [
        choice(
          "multi",
          "protocolos_passo1_terapias",
          "Passo 1: Os 4 Pilares da Saúde Integrativa",
          [
            {
              value: "jejum",
              label: "Jejum intermitente e desintoxicação intestinal",
            },
            {
              value: "terreno",
              label: "Modulação do terreno biológico (HCL, desparasitação)",
            },
            { value: "fito", label: "Fitoterapia, homeopatia e florais" },
            {
              value: "complementares",
              label:
                "Terapias complementares (Ozônio, biomat, eletromagnetismo, neuromodulação REAC/EMT)",
            },
          ],
        ),
        long("protocolos_passo1_obs", "Passo 1: Observações"),
        choice(
          "multi",
          "protocolos_passo2_terapias",
          "Passo 2: Reequilíbrio do Campo Sutil e Memória Celular",
          [
            {
              value: "micro",
              label:
                "Microfisioterapia, leitura biológica, constelação familiar",
            },
            {
              value: "hipno",
              label:
                "Hipnoterapia, PNL, ThetaHealing, reprogramação de crenças",
            },
            {
              value: "tics",
              label: "TICs (Terapia de Integração e Conexão Sistêmica)",
            },
          ],
        ),
        long("protocolos_passo2_obs", "Passo 2: Observações"),
        choice(
          "multi",
          "protocolos_passo3_terapias",
          "Passo 3: Modulação Hormonal e Nutricional",
          [
            {
              value: "suplementacao",
              label: "Suplementação específica para equilíbrio metabólico",
            },
          ],
        ),
        long("protocolos_passo3_obs", "Passo 3: Observações"),
        choice(
          "multi",
          "protocolos_passo4_terapias",
          "Passo 4: Atividade Física e Estilo de Vida",
          [
            {
              value: "habitos",
              label: "Mudança de hábitos e promoção do bem-estar",
            },
          ],
        ),
        long("protocolos_passo4_obs", "Passo 4: Observações"),
      ],
    },
  ],
};

export const TEMPLATES: Record<string, AnamnesisTemplate> = {
  [CURRENT_TEMPLATE_ID]: integrativa,
};

export function getTemplate(id: string): AnamnesisTemplate | null {
  return Object.hasOwn(TEMPLATES, id) ? TEMPLATES[id] : null;
}
