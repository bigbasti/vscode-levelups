package demo;

import org.springframework.batch.core.JobParameters;
import org.springframework.batch.core.JobParametersBuilder;
import org.springframework.batch.item.ItemWriter;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;

public class BatchConfig {

    @Bean
    public ItemWriter<String> tamTkg46NeLiItemWriter() {
        return items -> {};
    }

    public JobParameters params(String messageId) {
        return new JobParametersBuilder()
                .addString("MQ_MESSAGE_INCOMING.ID", messageId)
                .addLong("chunk", 100L)
                .toJobParameters();
    }

    @Bean
    public String consumer(@Qualifier("tamTkg46NeLiItemWriter") ItemWriter<String> writer,
                           @Value("#{jobParameters['MQ_MESSAGE_INCOMING.ID']}") String id) {
        return id;
    }
}
