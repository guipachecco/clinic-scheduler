# Várias clínicas

Desde 04/11/2026 o sistema atende várias clínicas no mesmo banco. A Grais é a primeira: a migração `0007_multi_clinic` moveu todos os dados que já existiam para ela.

## Quem vê o quê

| Conta                     | Como é criada                                         | O que vê                                                                                         |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Dona da clínica (`admin`) | `pnpm admin create`, informando o endereço da clínica | Só a própria clínica. Se a clínica for desativada, o painel dela fecha                           |
| Root                      | `pnpm admin create-root`                              | Todas as clínicas. Escolhe qual abrir em `/admin/clinicas`, onde também cria e desativa clínicas |

A conta de cliente e a página pública de cada clínica (`/<endereço>`, com o QR code) ainda não existem.

## Como os dados ficam separados

- **Toda tabela da clínica tem `clinic_id`:** pacientes, serviços, categorias, expediente, bloqueios, agendamentos, imagens e histórico. A tabela `clinics` substituiu a antiga `clinic_settings`, de linha única.
- **Toda função dos módulos recebe o `clinicId`** como primeiro parâmetro e filtra por ele. O `clinicId` vem sempre da sessão (`requireAdmin()`), nunca do formulário.
- **O banco também confere:** agendamentos apontam para paciente e serviço da mesma clínica, e serviços para categoria da mesma clínica, por chaves estrangeiras compostas `(clinic_id, id)`. Um agendamento que misture clínicas é recusado mesmo se o código errar.
- **A trava contra horário sobreposto vale dentro de cada clínica.** Duas clínicas podem ter atendimentos no mesmo horário. A constraint usa a extensão `btree_gist`.
- **Os locks de escrita da agenda, do expediente e dos feriados são por clínica,** para que uma clínica não espere a outra.
- **Nomes e endereços se repetem entre clínicas:** a mesma pessoa pode ser paciente de duas clínicas, e duas clínicas podem ter um serviço com o mesmo nome.

## Ao criar uma clínica

A clínica nasce com a categoria "Outros" e o serviço flexível "Avaliação / encaixe", como a primeira recebeu na migração `0005`. O endereço (`slug`) vira o link e o QR code da clínica, então não deve mudar depois de divulgado.

## O que ainda é igual para todas

- **Fuso horário:** todas usam `America/Sao_Paulo` (constante em `src/modules/schedule/time.ts`). A coluna `clinics.timezone` existe, mas ainda não é lida.
